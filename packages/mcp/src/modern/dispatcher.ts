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
import type { ContextRegistry } from "../context/registry.js";
import type { RequestScope } from "../dispatcher.js";
import type { Request } from "../protocol/messages.js";
import { ProtocolError } from "../protocol/responses.js";
import type { ResourceRegistry } from "../resources/registry.js";
import {
  listResources,
  listResourceTemplates,
  readResource,
  requireResources,
} from "../resources/requests.js";
import type { ToolAdapter } from "../tools/adapter.js";
import type { ToolContext } from "../tools/context.js";
import { createToolContext, toolClient } from "../tools/context.js";
import { callTool, discover, listTools } from "./handlers.js";
import { metadata } from "./metadata.js";
import { successResponse } from "./responses.js";
import { resourceResult } from "./results.js";

export function createModernDispatcher(
  tools: ToolAdapter,
  identity: Implementation,
  instructions?: string,
  providers?: ContextRegistry,
  resources?: ResourceRegistry,
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
    const context = (params: {
      _meta?: Record<string, unknown> | undefined;
    }): ToolContext =>
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
        providers,
        scope.reportProgress,
      );
    let result: Result | undefined;
    switch (request.method) {
      case "server/discover":
        result = discover(
          request.params,
          instructions,
          resources !== undefined,
        );
        break;
      case "tools/list":
        result = listTools(request.params, tools);
        break;
      case "tools/call":
        result = await callTool(request.params, tools, context);
        break;
      case "resources/list":
        result = resourceResult(
          listResources(request.params, requireResources(resources)),
        );
        break;
      case "resources/templates/list":
        result = resourceResult(
          listResourceTemplates(request.params, requireResources(resources)),
        );
        break;
      case "resources/read": {
        const value = await readResource(
          request.params,
          requireResources(resources),
          context,
          INVALID_PARAMS,
        );
        result = value === undefined ? undefined : resourceResult(value);
        break;
      }
      default:
        throw new ProtocolError(METHOD_NOT_FOUND, "Method not found");
    }
    return result ? successResponse(request.id, result, identity) : undefined;
  };
}
