import type { CallToolResult } from "@toolgrain/protocol/2025-06-18";
import type { ToolExecutionResult } from "../results.js";

/** The initialization-based format permits structured content only at an object root. */
export function toolResult(result: ToolExecutionResult): CallToolResult {
  const { structuredContent, ...content } = result;
  return {
    ...content,
    ...(structuredContent !== null &&
    typeof structuredContent === "object" &&
    !Array.isArray(structuredContent)
      ? { structuredContent: structuredContent as Record<string, unknown> }
      : {}),
  };
}
