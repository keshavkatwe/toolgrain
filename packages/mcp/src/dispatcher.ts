import {
  type Implementation,
  INVALID_PARAMS,
  type JSONRPCResultResponse,
  METHOD_NOT_FOUND,
  PROTOCOL_VERSION,
  type Result,
  UNSUPPORTED_PROTOCOL_VERSION,
} from "@toolgrain/protocol";
import { callTool, discover, listTools } from "./handlers.js";
import type { Request } from "./protocol/messages.js";
import { metadata } from "./protocol/metadata.js";
import { ProtocolError, successResponse } from "./protocol/responses.js";
import type { createToolAdapter } from "./tools.js";

export type Dispatcher = (
  request: Request,
  isActive: () => boolean,
) => Promise<JSONRPCResultResponse | undefined>;

export function createDispatcher(
  tools: ReturnType<typeof createToolAdapter>,
  identity: Implementation,
  instructions?: string,
): Dispatcher {
  return async (request: Request, isActive: () => boolean) => {
    const parsed = metadata.safeParse(request.params?._meta);
    if (!parsed.success)
      throw new ProtocolError(INVALID_PARAMS, "Invalid request metadata");
    const revision = parsed.data["io.modelcontextprotocol/protocolVersion"];
    if (revision !== PROTOCOL_VERSION)
      throw new ProtocolError(
        UNSUPPORTED_PROTOCOL_VERSION,
        "Unsupported protocol version",
        { supported: [PROTOCOL_VERSION], requested: revision },
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
