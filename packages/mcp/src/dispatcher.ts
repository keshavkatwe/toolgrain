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
import type { createToolAdapter } from "./tools.js";

export type Dispatcher = (
  request: Request,
  isActive: () => boolean,
  protocolVersion?: SupportedProtocolVersion,
) => Promise<ProtocolResponse | undefined>;

/** Compose the two protocol adapters around one execution registry. */
export function createDispatcher(
  tools: ReturnType<typeof createToolAdapter>,
  identity: Implementation,
  instructions?: string,
): Dispatcher {
  const legacy = createLegacyDispatcher(tools, identity, instructions);
  const modern = createModernDispatcher(tools, identity, instructions);
  return (request, isActive, protocolVersion) => {
    validateVersionContext(request, protocolVersion);
    return usesLegacyProtocol(request, protocolVersion)
      ? legacy(request, isActive)
      : modern(request, isActive);
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
