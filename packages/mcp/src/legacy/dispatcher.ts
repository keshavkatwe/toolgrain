import {
  type Implementation,
  LEGACY_PROTOCOL_VERSION,
  METHOD_NOT_FOUND,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import type { JSONRPCResponse, Result } from "@toolgrain/protocol/2025-06-18";
import type { Request } from "../protocol/messages.js";
import { ProtocolError } from "../protocol/responses.js";
import { hasProtocolVersionMetadata } from "../protocol/version-metadata.js";
import type { createToolAdapter } from "../tools/adapter.js";
import { callTool, initialize, listTools, ping } from "./handlers.js";
import { successResponse } from "./responses.js";

/** Initialization selects this adapter only without an explicit modern context. */
export function usesLegacyProtocol(
  request: Request,
  protocolVersion?: SupportedProtocolVersion,
): boolean {
  return (
    protocolVersion === LEGACY_PROTOCOL_VERSION ||
    (protocolVersion === undefined &&
      !hasProtocolVersionMetadata(request) &&
      request.method === "initialize")
  );
}

export function createLegacyDispatcher(
  tools: ReturnType<typeof createToolAdapter>,
  identity: Implementation,
  instructions?: string,
) {
  return async (
    request: Request,
    isActive: () => boolean,
  ): Promise<JSONRPCResponse | undefined> => {
    let result: Result | undefined;
    switch (request.method) {
      case "initialize":
        result = initialize(request.params, identity, instructions);
        break;
      case "ping":
        result = ping(request.params);
        break;
      case "tools/list":
        result = listTools(request.params, tools);
        break;
      case "tools/call":
        result = await callTool(request.params, tools, isActive);
        break;
      default:
        throw new ProtocolError(METHOD_NOT_FOUND, "Method not found");
    }
    return result ? successResponse(request.id, result) : undefined;
  };
}
