import {
  type Implementation,
  INVALID_PARAMS,
  LEGACY_PROTOCOL_VERSION,
} from "@toolgrain/protocol";
import type {
  InitializeResult,
  ListToolsResult,
} from "@toolgrain/protocol/2025-06-18";
import { ProtocolError } from "../protocol/responses.js";
import type { ToolAdapter } from "../tools/adapter.js";
import { callTool as executeToolCall } from "../tools/call.js";
import type { ToolContext } from "../tools/context.js";
import {
  callParams,
  commonParams,
  initializeParams,
  listParams,
} from "./messages.js";
import { toolResult } from "./results.js";

/** Initialization can only negotiate the initialization-based revision. */
export function initialize(
  params: unknown,
  identity: Implementation,
  instructions?: string,
): InitializeResult {
  if (!initializeParams.safeParse(params).success)
    throw new ProtocolError(
      INVALID_PARAMS,
      "Invalid initialization parameters",
    );
  return {
    protocolVersion: LEGACY_PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: { ...identity },
    ...(instructions === undefined ? {} : { instructions }),
  };
}

export function ping(params: unknown): Record<string, never> {
  if (!commonParams.safeParse(params ?? {}).success)
    throw new ProtocolError(INVALID_PARAMS, "Invalid ping parameters");
  return {};
}

export function listTools(
  params: unknown,
  tools: ToolAdapter,
): ListToolsResult {
  const parsed = listParams.safeParse(params ?? {});
  if (!parsed.success || parsed.data.cursor)
    throw new ProtocolError(INVALID_PARAMS, "Invalid tool list parameters");
  return {
    tools: tools
      .list()
      .map(({ icons: _icons, outputSchema, ...definition }) => ({
        ...definition,
        ...(outputSchema?.type === "object"
          ? { outputSchema: { ...outputSchema, type: "object" as const } }
          : {}),
      })),
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
