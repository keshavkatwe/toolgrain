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

export interface ServerOptions<Tools extends ToolMap = ToolMap> {
  name: string;
  version: string;
  tools: Tools;
  instructions?: string;
  /** Tool failures include frozen tool/request details; other diagnostics omit them. */
  onError?: ErrorHandler;
  auth?: AuthProvider;
  context?: readonly RegisteredContextProvider[];
}

export interface HandleOptions {
  signal?: AbortSignal;
  protocolVersion?: SupportedProtocolVersion;
  auth?: AuthScope;
}

export interface Server {
  handle(
    message: unknown,
    options?: HandleOptions,
  ): Promise<ProtocolResponse | undefined>;
  getToolDefinitions(): ProtocolTool[];
  getAuthMetadata(): AuthMetadata | undefined;
  authorize(
    accessToken: string,
    options: { resource: string; signal?: AbortSignal },
  ): Promise<AuthScope>;
  listen(transport: Transport | RequestTransport): Promise<void>;
  close(): Promise<void>;
}

/** Compose the tool adapter, MCP dispatcher, and transport connection. */
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
    async handle(message, { signal, protocolVersion, auth } = {}) {
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
