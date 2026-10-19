import {
  type ClientCapabilities,
  type Implementation,
  PROTOCOL_VERSION,
  type RequestId,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";

/** What the client reported about itself. */
export interface ToolClient {
  readonly info?: Implementation;
  readonly capabilities?: ClientCapabilities;
}

export interface ToolRequest {
  readonly id: RequestId;
  readonly protocolVersion: SupportedProtocolVersion;
  /** Absent when the era and transport carry no client information, such as legacy HTTP. */
  readonly client?: ToolClient;
  /** A copy of the request's `_meta`; empty when the request carried none. */
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
}

/** Build a context for calling a definition's `execute` directly, for example in tests. */
export function toolContext(options: ToolContextOptions = {}): ToolContext {
  return createToolContext(options.signal ?? new AbortController().signal, {
    id: 0,
    protocolVersion: PROTOCOL_VERSION,
    meta: {},
    ...options.request,
  });
}

export function createToolContext(
  signal: AbortSignal,
  request: ToolRequest,
): ToolContext {
  return Object.freeze({
    signal,
    request: Object.freeze({
      ...request,
      meta: Object.freeze({ ...request.meta }),
    }),
  });
}

/** Omit absent fields so the context matches its optional-property types. */
export function toolClient(
  info: Implementation | undefined,
  capabilities: ClientCapabilities | undefined,
): ToolClient {
  return Object.freeze({
    ...(info === undefined ? {} : { info }),
    ...(capabilities === undefined ? {} : { capabilities }),
  });
}
