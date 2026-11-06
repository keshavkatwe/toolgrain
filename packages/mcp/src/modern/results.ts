import type { CallToolResult } from "@toolgrain/protocol";
import type { ToolExecutionResult } from "../tools/results.js";

export function toolResult(result: ToolExecutionResult): CallToolResult {
  return { resultType: "complete", ...result };
}

/** Resource results do not enable caching until applications have a cache-policy API. */
export function resourceResult<Result extends object>(result: Result) {
  return {
    ...result,
    resultType: "complete" as const,
    ttlMs: 0,
    cacheScope: "private" as const,
  };
}
