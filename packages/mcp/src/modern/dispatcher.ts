import {
  type ClientCapabilities,
  type Implementation,
  INVALID_PARAMS,
  type JSONRPCResultResponse,
  METHOD_NOT_FOUND,
  PROTOCOL_VERSION,
  type Result,
  SUPPORTED_PROTOCOL_VERSIONS,
  UNSUPPORTED_PROTOCOL_VERSION,
} from "@toolgrain/protocol";
import type { RequestScope } from "../dispatcher.js";
import type { Request } from "../protocol/messages.js";
import { ProtocolError } from "../protocol/responses.js";
import type { ToolAdapter } from "../tools/adapter.js";
import { createToolContext, toolClient } from "../tools/context.js";
import { callTool, discover, listTools } from "./handlers.js";
import { metadata } from "./metadata.js";
import { successResponse } from "./responses.js";

export function createModernDispatcher(
  tools: ToolAdapter,
  identity: Implementation,
  instructions?: string,
) {
  return async (
    request: Request,
    scope: RequestScope,
  ): Promise<JSONRPCResultResponse | undefined> => {
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
        result = await callTool(request.params, tools, (params) =>
          createToolContext(
            scope.signal,
            {
              id: request.id,
              protocolVersion: PROTOCOL_VERSION,
              client: toolClient(
                parsed.data["io.modelcontextprotocol/clientInfo"] as
                  | Implementation
                  | undefined,
                parsed.data[
                  "io.modelcontextprotocol/clientCapabilities"
                ] as ClientCapabilities,
              ),
              meta: params._meta ?? {},
            },
            scope.auth,
          ),
        );
        break;
      default:
        throw new ProtocolError(METHOD_NOT_FOUND, "Method not found");
    }
    return result ? successResponse(request.id, result, identity) : undefined;
  };
}
