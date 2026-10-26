import type {
  ProtocolResponse,
  Tool as ProtocolTool,
  SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { createAuthorization } from "./auth/authorization.js";
import { AuthError, isAuthError } from "./auth/errors.js";
import type { AuthMetadata, AuthProvider, AuthScope } from "./auth/types.js";
import { createConnection } from "./connection.js";
import type { RegisteredContextProvider } from "./context/definition.js";
import { createContextRegistry } from "./context/registry.js";
import { type ErrorHandler, reportError } from "./diagnostics.js";
import { createDispatcher, formatErrorResponse } from "./dispatcher.js";
import { executeRequest } from "./execute-request.js";
import { decode } from "./protocol/decode.js";
import { createToolAdapter } from "./tools/adapter.js";
import type { ToolMap } from "./tools/registry.js";
import {
  isRequestTransport,
  type RequestTransport,
  type Transport,
} from "./transport.js";

/** Tool registrations, identity, and shared configuration for an MCP server. */
export interface ServerOptions<Tools extends ToolMap = ToolMap> {
  /** Server implementation name advertised to clients. */
  name: string;
  /** Application version advertised to clients; independent of the protocol revision. */
  version: string;
  /** Tools made with `tool()`; each registration key becomes its exposed tool name. */
  tools: Tools;
  /** Optional usage instructions advertised to clients during discovery or initialization. */
  instructions?: string;
  /**
   * Receives original unexpected failures for private diagnostics. Tool failures
   * include frozen tool/request details; auth and transport failures pass only
   * the error. Throws and rejected promises from this callback are ignored.
   */
  onError?: ErrorHandler;
  /** Eager endpoint authorization; requires a request transport rather than stdio. */
  auth?: AuthProvider;
  /** Lazy providers or typed overrides available to handlers; registration order is irrelevant. */
  context?: readonly RegisteredContextProvider[];
}

/** Request-local settings for direct protocol dispatch through `Server.handle()`. */
export interface HandleOptions {
  /** Cooperative cancellation signal; handlers must observe it, and late responses are suppressed. */
  signal?: AbortSignal;
  /**
   * Protocol revision selected by the adapter. If omitted, dispatch is modern except
   * for legacy initialization requests without explicit protocol-version metadata.
   */
  protocolVersion?: SupportedProtocolVersion;
  /** Single-use scope issued by this server's `authorize()`; dispose it in `finally`. */
  auth?: AuthScope;
}

/** An MCP dispatcher with one optional transport attachment and terminal shutdown. */
export interface Server {
  /**
   * Dispatch a decoded JSON value, including tool validation and MCP result conversion.
   * This independent request path does not retain initialization or session state.
   *
   * @param message - Untrusted, already JSON-decoded protocol message.
   * @param options - Cancellation, protocol selection, and any required authorization scope.
   * @returns A protocol response, or `undefined` for ignored or cancelled messages.
   * @throws If the server is closed or its required authorization scope is invalid.
   */
  handle(
    message: unknown,
    options?: HandleOptions,
  ): Promise<ProtocolResponse | undefined>;
  /** Return copied wire descriptions using registration keys as tool names. */
  getToolDefinitions(): ProtocolTool[];
  /** Return copied public auth configuration, or `undefined` for an unprotected server. */
  getAuthMetadata(): AuthMetadata | undefined;
  /**
   * Verify a bearer token before reading a request body or invoking tools.
   * The identity is copied and deeply frozen before a server-bound scope is issued.
   *
   * @param accessToken - Raw bearer token, without the `Bearer ` prefix.
   * @param options - Resource audience and cancellation settings for this request.
   * @returns A single-use scope; the caller must dispose it in `finally`.
   * @throws For rejected credentials, provider failures, cancellation, or a closed server.
   */
  authorize(
    accessToken: string,
    options: {
      /** Public MCP resource URL; a configured provider resource takes precedence. */
      resource: string;
      /** Cancels verification and remains active while the returned scope is in use. */
      signal?: AbortSignal;
    },
  ): Promise<AuthScope>;
  /**
   * Attach and start one single-use transport, resolving when startup completes.
   * Auth-configured servers require a request transport. A closed server cannot restart.
   *
   * @param transport - An unused transport, including one from a compatible package copy.
   * @throws If attachment or startup fails, or the transport is already owned.
   */
  listen(transport: Transport | RequestTransport): Promise<void>;
  /** Abort active work and close the attached transport; repeated or nested calls are safe. */
  close(): Promise<void>;
}

/**
 * Create a server from reusable tools, optional auth, and lazy context providers.
 * Registration validates tool names, metadata, and exposable schemas immediately.
 * Creating the server does not start a transport or resolve context providers.
 *
 * @param options - Server identity and application-owned tool/provider registrations.
 * @returns An independent server ready for direct dispatch or `listen()`.
 * @throws For invalid registrations, tool schemas, or authorization configuration.
 */
export function createServer<const Tools extends ToolMap>(
  options: ServerOptions<Tools>,
): Server {
  const authorization = createAuthorization(options.auth);
  const tools = createToolAdapter(options.tools, options.onError);
  const dispatch = createDispatcher(
    tools,
    { name: options.name, version: options.version },
    options.instructions,
    createContextRegistry(options.context),
  );
  let closed = false;
  const running = new Set<AbortController>();
  const closeIndependent = () => {
    if (closed) return;
    closed = true;
    for (const controller of running)
      controller.abort(new DOMException("Server closed", "AbortError"));
    running.clear();
  };
  const connection = createConnection(
    dispatch,
    options.onError,
    closeIndependent,
  );
  const requestController = (signal?: AbortSignal) => {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    running.add(controller);
    return {
      signal: controller.signal,
      finish() {
        signal?.removeEventListener("abort", abort);
        running.delete(controller);
      },
    };
  };
  const server: Server = {
    async listen(transport) {
      if (isRequestTransport(transport))
        return connection.listenRequests(transport, server);
      if (authorization.metadata())
        throw new Error(
          "Auth-configured servers require HTTP and cannot listen on a message transport",
        );
      return connection.listen(transport);
    },
    getToolDefinitions: () => tools.list(),
    getAuthMetadata: authorization.metadata,
    async authorize(accessToken, { resource, signal }) {
      if (closed) throw new AuthError("temporarily_unavailable");
      const pending = requestController(signal);
      try {
        return await authorization.authorize(
          accessToken,
          resource,
          pending.signal,
          pending.finish,
        );
      } catch (error) {
        pending.finish();
        if (
          !pending.signal.aborted &&
          (!isAuthError(error) || error.code === "temporarily_unavailable")
        )
          reportError(options.onError, error);
        throw error;
      }
    },
    async handle(
      message,
      { signal, protocolVersion, auth }: HandleOptions = {},
    ) {
      if (closed) throw new Error("Server is closed");
      const identity = authorization.consume(auth);
      if (auth?.signal.aborted) return;
      const active = () => !closed && !signal?.aborted;
      if (!active()) return;
      const incoming = decode(message);
      if (incoming.kind === "error")
        return formatErrorResponse(incoming.response, protocolVersion);
      if (incoming.kind !== "request") return;
      const pending = requestController(signal);
      // The authorization signal covers verification and body decoding too.
      const combined = auth
        ? AbortSignal.any([pending.signal, auth.signal])
        : pending.signal;
      try {
        return await executeRequest(
          dispatch,
          incoming.request,
          { signal: combined, ...(identity ? { auth: identity } : {}) },
          options.onError,
          protocolVersion,
        );
      } finally {
        pending.finish();
      }
    },
    close() {
      closeIndependent();
      return connection.close();
    },
  };
  return server;
}
