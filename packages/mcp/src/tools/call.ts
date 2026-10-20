import { INVALID_PARAMS } from "@toolgrain/protocol";
import { ProtocolError } from "../protocol/responses.js";
import type { ToolAdapter } from "./adapter.js";
import type { ToolContext } from "./context.js";

/** Execute an already-validated call through the shared registry. */
export function callTool(
  {
    name,
    arguments: input = {},
  }: { name: string; arguments?: Record<string, unknown> | undefined },
  tools: ToolAdapter,
  ctx: ToolContext,
) {
  if (!tools.has(name))
    throw new ProtocolError(INVALID_PARAMS, `Unknown tool: ${name}`);
  return tools.execute(name, input, ctx);
}
