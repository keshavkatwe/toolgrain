import type { CallToolResult } from "@toolgrain/protocol";
import { assertJSON } from "./json-value.js";

export function toolResult(value: unknown): CallToolResult {
  assertJSON(value);
  if (typeof value === "string")
    return { resultType: "complete", content: [{ type: "text", text: value }] };
  // Round-tripping captures a JSON snapshot and avoids retaining handler-owned objects.
  const text = JSON.stringify(value);
  return {
    resultType: "complete",
    content: [{ type: "text", text }],
    structuredContent: JSON.parse(text),
  };
}

export function toolError(message: string): CallToolResult {
  return {
    resultType: "complete",
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
