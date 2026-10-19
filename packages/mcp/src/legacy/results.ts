import type { CallToolResult } from "@toolgrain/protocol/2025-06-18";
import type { ToolExecutionResult } from "../tools/results.js";

/** The initialization-based format permits structured content only at an object root. */
export function toolResult(result: ToolExecutionResult): CallToolResult {
  const { structuredContent, ...content } = result;
  return {
    ...content,
    content: content.content.map((block) => {
      if (block.type !== "resource_link") return block;
      const { icons: _icons, ...resource } = block;
      return resource;
    }),
    ...(structuredContent !== null &&
    typeof structuredContent === "object" &&
    !Array.isArray(structuredContent)
      ? { structuredContent: structuredContent as Record<string, unknown> }
      : {}),
  };
}
