import {
  type DiscoverResult,
  INVALID_PARAMS,
  type ListToolsResult,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@toolgrain/protocol";
import { ProtocolError } from "../protocol/responses.js";
import type { ToolAdapter } from "../tools/adapter.js";
import { callTool as executeToolCall } from "../tools/call.js";
import type { ToolContext } from "../tools/context.js";
import { callParams, commonParams, listParams } from "./messages.js";
import { toolResult } from "./results.js";

export function discover(
  params: unknown,
  instructions?: string,
): DiscoverResult {
  if (!commonParams.safeParse(params).success)
    throw new ProtocolError(INVALID_PARAMS, "Invalid discovery parameters");
  return {
    resultType: "complete",
    ttlMs: 0,
    cacheScope: "private",
    supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    capabilities: { tools: {} },
    ...(instructions === undefined ? {} : { instructions }),
  };
}

export function listTools(
  params: unknown,
  tools: ToolAdapter,
): ListToolsResult {
  const parsed = listParams.safeParse(params);
  if (!parsed.success || parsed.data.cursor)
    throw new ProtocolError(INVALID_PARAMS, "Invalid tool list parameters");
  return {
    resultType: "complete",
    ttlMs: 0,
    cacheScope: "private",
    tools: tools.list(),
  };
}

export async function callTool(
  params: unknown,
  tools: ToolAdapter,
  ctx: (params: { _meta?: Record<string, unknown> | undefined }) => ToolContext,
) {
  const parsed = callParams.safeParse(params);
  if (!parsed.success)
    throw new ProtocolError(INVALID_PARAMS, "Invalid tool call parameters");
  const result = await executeToolCall(parsed.data, tools, ctx(parsed.data));
  return result ? toolResult(result) : undefined;
}
