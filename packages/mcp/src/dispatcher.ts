import {
  type Implementation,
  INVALID_PARAMS,
  LEGACY_PROTOCOL_VERSION,
  METHOD_NOT_FOUND,
  PROTOCOL_VERSION,
  type ProtocolResponse,
  type Result,
  SUPPORTED_PROTOCOL_VERSIONS,
  type SupportedProtocolVersion,
  UNSUPPORTED_PROTOCOL_VERSION,
} from "@toolgrain/protocol";
import { callTool, discover, listTools } from "./handlers.js";
import { initialize, listLegacyTools, ping } from "./legacy-handlers.js";
import { requestVersion } from "./protocol/era.js";
import type { Request } from "./protocol/messages.js";
import { metadata } from "./protocol/metadata.js";
import {
  legacyResponse,
  ProtocolError,
  successResponse,
} from "./protocol/responses.js";
import { legacyToolResult } from "./results.js";
import type { createToolAdapter } from "./tools.js";

export type Dispatcher = (
  request: Request,
  isActive: () => boolean,
  protocolVersion?: SupportedProtocolVersion,
) => Promise<ProtocolResponse | undefined>;

export function createDispatcher(
  tools: ReturnType<typeof createToolAdapter>,
  identity: Implementation,
  instructions?: string,
): Dispatcher {
  return async (
    request: Request,
    isActive: () => boolean,
    protocolVersion?: SupportedProtocolVersion,
  ) => {
    if (requestVersion(request, protocolVersion) === LEGACY_PROTOCOL_VERSION) {
      let result: Record<string, unknown> | undefined;
      switch (request.method) {
        case "initialize":
          result = initialize(request.params, identity, instructions);
          break;
        case "ping":
          result = ping(request.params);
          break;
        case "tools/list":
          result = listLegacyTools(request.params, tools);
          break;
        case "tools/call": {
          const modern = await callTool(request.params, tools, isActive, true);
          if (!modern) return;
          result = legacyToolResult(modern);
          break;
        }
        default:
          throw new ProtocolError(METHOD_NOT_FOUND, "Method not found");
      }
      return legacyResponse(request.id, result);
    }
    const parsed = metadata.safeParse(request.params?._meta);
    if (!parsed.success)
      throw new ProtocolError(INVALID_PARAMS, "Invalid request metadata");
    const revision = parsed.data["io.modelcontextprotocol/protocolVersion"];
    if (revision !== PROTOCOL_VERSION)
      throw new ProtocolError(
        UNSUPPORTED_PROTOCOL_VERSION,
        "Unsupported protocol version",
        { supported: [...SUPPORTED_PROTOCOL_VERSIONS], requested: revision },
      );

    let result: Result | undefined;
    switch (request.method) {
      case "server/discover":
        result = discover(request.params, instructions);
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
    return result ? successResponse(request.id, result, identity) : undefined;
  };
}
