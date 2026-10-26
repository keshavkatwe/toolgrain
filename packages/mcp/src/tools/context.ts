import {
  type ClientCapabilities,
  type Implementation,
  PROTOCOL_VERSION,
  type RequestId,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import type {
  ClientCapabilities as LegacyClientCapabilities,
  Implementation as LegacyImplementation,
} from "@toolgrain/protocol/2025-06-18";
import { attachAuth } from "../auth/context.js";
import type { AuthIdentity } from "../auth/types.js";
import type { RegisteredContextProvider } from "../context/definition.js";
import {
  type ContextRegistry,
  createContextRegistry,
} from "../context/registry.js";
import { createContextScope } from "../context/scope.js";
import type { DeepReadonly } from "./json-value.js";

/** What the client reported about itself; unverified, so not a basis for security decisions. */
export interface ToolClient {
  /** Copied, deeply frozen implementation details supplied by the client, when available. */
  readonly info?: DeepReadonly<Implementation | LegacyImplementation>;
  /** Copied, deeply frozen capability claims supplied by the client, when available. */
  readonly capabilities?: DeepReadonly<
    ClientCapabilities | LegacyClientCapabilities
  >;
}

/** Copied, immutable protocol metadata for one invocation; client claims remain unverified. */
export interface ToolRequest {
  /** JSON-RPC request identifier; identical IDs can occur in independent contexts. */
  readonly id: RequestId;
  /** Supported protocol revision selected for this invocation. */
  readonly protocolVersion: SupportedProtocolVersion;
  /** Absent when the era and transport carry no client information, such as legacy HTTP. */
  readonly client?: ToolClient;
  /** A deeply frozen copy of the request's `_meta`; empty when the request carried none. */
  readonly meta: Readonly<Record<string, unknown>>;
}

/** Per-invocation data passed to tool handlers and lazy context resolvers. */
export interface ToolContext {
  /** Aborts when the client cancels or disconnects, or the transport or server closes. */
  readonly signal: AbortSignal;
  /** Frozen request metadata; contains no verified authorization identity. */
  readonly request: ToolRequest;
}

/** Optional metadata, cancellation, and provider bindings for a direct-call context. */
export interface ToolContextOptions {
  /** Caller-owned cancellation signal; defaults to a fresh, non-aborted signal. */
  signal?: AbortSignal;
  /** Request fields to override; defaults are ID `0`, the modern revision, and empty metadata. */
  request?: Partial<ToolRequest>;
  /** Providers or overrides available through their accessors; defaults to no registrations. */
  context?: readonly RegisteredContextProvider[];
}

/**
 * Build an unauthenticated context for direct `execute()` calls, for example in tests.
 * Request metadata is copied and deeply frozen; each call creates a fresh provider cache.
 * Direct execution still bypasses server authorization, validation, and MCP conversion.
 *
 * @param options - Optional signal, request metadata, and provider registrations.
 * @returns A context accepted by Toolgrain's provider accessors.
 */
export function toolContext(options: ToolContextOptions = {}): ToolContext {
  // Default each field separately so an explicit undefined cannot replace a default.
  const {
    id = 0,
    protocolVersion = PROTOCOL_VERSION,
    client,
    meta = {},
  } = options.request ?? {};
  return createToolContext(
    options.signal ?? new AbortController().signal,
    {
      id,
      protocolVersion,
      ...(client === undefined ? {} : { client }),
      meta,
    },
    undefined,
    createContextRegistry(options.context),
  );
}

/** Each request gets its own deeply frozen copies, so handlers cannot affect one another. */
export function createToolContext(
  signal: AbortSignal,
  { client, ...request }: ToolRequest,
  auth?: AuthIdentity,
  providers: ContextRegistry = createContextRegistry(),
): ToolContext {
  const ctx = attachAuth(
    {
      signal,
      request: Object.freeze({
        ...request,
        ...(client === undefined
          ? {}
          : {
              client: frozenCopy(toolClient(client.info, client.capabilities)),
            }),
        meta: frozenCopy(request.meta),
      }),
    },
    auth,
  );
  return createContextScope(ctx, providers);
}

/** Omit absent fields so the client matches its optional-property types. */
export function toolClient(
  info: ToolClient["info"],
  capabilities: ToolClient["capabilities"],
): ToolClient {
  return {
    ...(info === undefined ? {} : { info }),
    ...(capabilities === undefined ? {} : { capabilities }),
  };
}

function frozenCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
