import type { CallToolResult } from "@toolgrain/protocol";
import type { ToolExecutionResult } from "../results.js";

export function toolResult(result: ToolExecutionResult): CallToolResult {
  return { resultType: "complete", ...result };
}
