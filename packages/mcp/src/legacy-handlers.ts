import {
  type Implementation,
  INVALID_PARAMS,
  LEGACY_PROTOCOL_VERSION,
} from "@toolgrain/protocol";
import type {
  InitializeResult,
  ListToolsResult,
} from "@toolgrain/protocol/2025-06-18";
import {
  initializeParams,
  legacyCommonParams,
  legacyListParams,
} from "./protocol/messages.js";
import { ProtocolError } from "./protocol/responses.js";
import type { createToolAdapter } from "./tools.js";

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
  if (!legacyCommonParams.safeParse(params ?? {}).success)
    throw new ProtocolError(INVALID_PARAMS, "Invalid ping parameters");
  return {};
}

export function listLegacyTools(
  params: unknown,
  tools: ReturnType<typeof createToolAdapter>,
): ListToolsResult {
  const parsed = legacyListParams.safeParse(params ?? {});
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
