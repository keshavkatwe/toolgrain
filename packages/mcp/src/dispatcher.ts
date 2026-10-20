import {
  type Implementation,
  type JSONRPCErrorResponse,
  LEGACY_PROTOCOL_VERSION,
  type ProtocolResponse,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import {
  createLegacyDispatcher,
  usesLegacyProtocol,
} from "./legacy/dispatcher.js";
import { errorResponse as legacyErrorResponse } from "./legacy/responses.js";
import { createModernDispatcher } from "./modern/dispatcher.js";
import type { Request } from "./protocol/messages.js";
import { validateVersionContext } from "./protocol/version-metadata.js";
import type { ToolAdapter } from "./tools/adapter.js";
import type { ToolClient } from "./tools/context.js";

/** Per-request execution state supplied by the connection or independent caller. */
export interface RequestScope {
  signal: AbortSignal;
  /** Client details negotiated by legacy initialization, when the connection has them. */
  client?: ToolClient | undefined;
}

export type Dispatcher = (
  request: Request,
  scope: RequestScope,
  protocolVersion?: SupportedProtocolVersion,
) => Promise<ProtocolResponse | undefined>;

/** Compose the two protocol adapters around one execution registry. */
export function createDispatcher(
  tools: ToolAdapter,
  identity: Implementation,
  instructions?: string,
): Dispatcher {
  const legacy = createLegacyDispatcher(tools, identity, instructions);
  const modern = createModernDispatcher(tools, identity, instructions);
  return (request, scope, protocolVersion) => {
    validateVersionContext(request, protocolVersion);
    return usesLegacyProtocol(request, protocolVersion)
      ? legacy(request, scope)
      : modern(request, scope);
  };
}

/** Envelope errors have no negotiated connection when processing independent calls. */
export function formatErrorResponse(
  response: JSONRPCErrorResponse,
  protocolVersion?: SupportedProtocolVersion,
): ProtocolResponse {
  return protocolVersion === LEGACY_PROTOCOL_VERSION
    ? legacyErrorResponse(response)
    : response;
}
