import { assertJSON } from "./json-value.js";

/** Validated output shared by both protocol adapters. */
export interface ToolExecutionResult {
  content: { type: "text"; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

export function toolResult(value: unknown): ToolExecutionResult {
  assertJSON(value);
  if (typeof value === "string")
    return { content: [{ type: "text", text: value }] };
  // Round-tripping captures a JSON snapshot and avoids retaining handler-owned objects.
  const text = JSON.stringify(value);
  return {
    content: [{ type: "text", text }],
    structuredContent: JSON.parse(text),
  };
}

export function toolError(message: string): ToolExecutionResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
