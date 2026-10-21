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

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

/** What the client reported about itself; unverified, so not a basis for security decisions. */
export interface ToolClient {
  readonly info?: DeepReadonly<Implementation | LegacyImplementation>;
  readonly capabilities?: DeepReadonly<
    ClientCapabilities | LegacyClientCapabilities
  >;
}

export interface ToolRequest {
  readonly id: RequestId;
  readonly protocolVersion: SupportedProtocolVersion;
  /** Absent when the era and transport carry no client information, such as legacy HTTP. */
  readonly client?: ToolClient;
  /** A deeply frozen copy of the request's `_meta`; empty when the request carried none. */
  readonly meta: Readonly<Record<string, unknown>>;
}

export interface ToolContext {
  /** Aborts when the client cancels or disconnects, or the transport or server closes. */
  readonly signal: AbortSignal;
  readonly request: ToolRequest;
}

export interface ToolContextOptions {
  signal?: AbortSignal;
  request?: Partial<ToolRequest>;
  context?: readonly RegisteredContextProvider[];
}

/** Build a context for calling a definition's `execute` directly, for example in tests. */
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
