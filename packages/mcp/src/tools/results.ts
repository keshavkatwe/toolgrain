import type { ContentBlock, MetaObject } from "@toolgrain/protocol";
import type { z } from "zod";
import { explicitResult } from "./content.js";
import { assertJSON } from "./json-value.js";
import { McpResult } from "./rich-result.js";

/** Validated output shared by both protocol adapters. */
export interface ToolExecutionResult {
  content: ContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: MetaObject;
}

export function toolResult(value: unknown): ToolExecutionResult {
  if (value instanceof McpResult)
    return withStructuredText(readExplicit(value));
  assertJSON(value);
  if (typeof value === "string")
    return { content: [{ type: "text", text: value }] };
  return structuredResult(value);
}

function structuredResult(value: unknown): ToolExecutionResult {
  assertJSON(value);
  const text = JSON.stringify(value);
  return {
    content: [{ type: "text", text }],
    structuredContent: JSON.parse(text),
  };
}

function readExplicit(value: McpResult<unknown>): ToolExecutionResult {
  assertJSON(value.value);
  // JSON validation excludes explicit undefined optional fields before schema parsing.
  return explicitResult.parse(
    JSON.parse(JSON.stringify(value.value)),
  ) as ToolExecutionResult;
}

function withStructuredText(result: ToolExecutionResult): ToolExecutionResult {
  if (Object.hasOwn(result, "structuredContent")) {
    const text = JSON.stringify(result.structuredContent);
    if (
      !result.content.some(
        (block) => block.type === "text" && block.text === text,
      )
    )
      result.content.push({ type: "text", text });
  }
  return result;
}

/** Validate supplied structured data, including data in explicit error results. */
export async function resolveToolResult(
  name: string,
  value: unknown,
  output?: z.ZodType,
): Promise<ToolExecutionResult> {
  if (!output) return toolResult(value);
  const explicit = value instanceof McpResult ? readExplicit(value) : undefined;
  if (explicit && !Object.hasOwn(explicit, "structuredContent")) {
    if (explicit.isError) return explicit;
    throw new Error(
      `Output schema requires structuredContent for tool: ${name}`,
    );
  }
  const parsed = await output.safeParseAsync(
    explicit ? explicit.structuredContent : value,
  );
  if (!parsed.success)
    throw new Error(`Invalid output for tool: ${name}`, {
      cause: parsed.error,
    });
  const result = structuredResult(parsed.data);
  return explicit
    ? withStructuredText({
        ...explicit,
        structuredContent: result.structuredContent,
      })
    : result;
}

export function toolError(message: string): ToolExecutionResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
