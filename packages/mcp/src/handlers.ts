import { callParams, commonParams, listParams } from "./protocol/messages.js";
import { ProtocolError } from "./protocol/responses.js";
import { PROTOCOL_VERSION } from "./protocol.js";
import type { createToolAdapter } from "./tools.js";
import {
  type DiscoverResult,
  INVALID_PARAMS,
  type ListToolsResult,
} from "./vendor/schema.js";

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
    supportedVersions: [PROTOCOL_VERSION],
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
  const { name, arguments: input = {} } = parsed.data;
  if (!tools.has(name))
    throw new ProtocolError(INVALID_PARAMS, `Unknown tool: ${name}`);
  return tools.execute(name, input, isActive);
}
