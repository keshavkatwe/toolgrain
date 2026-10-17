import {
  type Implementation,
  INVALID_PARAMS,
  LEGACY_PROTOCOL_VERSION,
} from "@toolgrain/protocol";
import type {
  InitializeResult,
  ListToolsResult,
} from "@toolgrain/protocol/2025-06-18";
import { callTool as executeToolCall } from "../call-tool.js";
import { ProtocolError } from "../protocol/responses.js";
import type { createToolAdapter } from "../tools.js";
import {
  callParams,
  commonParams,
  initializeParams,
  listParams,
} from "./messages.js";
import { toolResult } from "./results.js";

type Tools = ReturnType<typeof createToolAdapter>;

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
    serverInfo: identity,
    ...(instructions === undefined ? {} : { instructions }),
  };
}

export function ping(params: unknown): Record<string, never> {
  if (!commonParams.safeParse(params ?? {}).success)
    throw new ProtocolError(INVALID_PARAMS, "Invalid ping parameters");
  return {};
}

export function listTools(params: unknown, tools: Tools): ListToolsResult {
  const parsed = listParams.safeParse(params ?? {});
  if (!parsed.success || parsed.data.cursor)
    throw new ProtocolError(INVALID_PARAMS, "Invalid tool list parameters");
  return {
    tools: tools.list().map(({ name, inputSchema, description }) => ({
      name,
      inputSchema,
      ...(description === undefined ? {} : { description }),
    })),
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
