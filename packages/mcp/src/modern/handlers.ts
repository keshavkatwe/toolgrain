import {
  type DiscoverResult,
  INVALID_PARAMS,
  type ListToolsResult,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@toolgrain/protocol";
import { callTool as executeToolCall } from "../call-tool.js";
import { ProtocolError } from "../protocol/responses.js";
import type { createToolAdapter } from "../tools.js";
import { callParams, commonParams, listParams } from "./messages.js";
import { toolResult } from "./results.js";

type Tools = ReturnType<typeof createToolAdapter>;

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

export function listTools(params: unknown, tools: Tools): ListToolsResult {
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
  tools: Tools,
  isActive: () => boolean,
) {
  const parsed = callParams.safeParse(params);
  if (!parsed.success)
    throw new ProtocolError(INVALID_PARAMS, "Invalid tool call parameters");
  const result = await executeToolCall(parsed.data, tools, isActive);
  return result ? toolResult(result) : undefined;
}
