import type { ContentBlock, MetaObject } from "@toolgrain/protocol";
import * as core from "zod/v4/core";
import { explicitResult } from "./content.js";
import { type AssertJSONOptions, assertJSON } from "./json-value.js";
import { isMcpResult, type McpResult } from "./rich-result.js";

/** Validated output shared by both protocol adapters. */
export interface ToolExecutionResult {
  content: ContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: MetaObject;
}

export function toolResult(value: unknown): ToolExecutionResult {
  if (isMcpResult(value)) return withStructuredText(readExplicit(value));
  if (typeof value === "string")
    return { content: [{ type: "text", text: value }] };
  return structuredResult(value);
}

function structuredResult(
  value: unknown,
  options?: AssertJSONOptions,
): ToolExecutionResult {
  assertJSON(value, options);
  const text = JSON.stringify(value);
  return {
    content: [{ type: "text", text }],
    structuredContent: JSON.parse(text),
  };
}

function readExplicit(value: McpResult<unknown>): ToolExecutionResult {
  // Structured content is application data, so undefined values inside it fail.
  const { structuredContent } = value.value;
  if (structuredContent !== undefined) assertJSON(structuredContent);
  // Undefined optional envelope fields, such as `isError: undefined`, are absent.
  assertJSON(value.value, { omitUndefined: true });
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
  output?: core.$ZodType,
): Promise<ToolExecutionResult> {
  if (!output) return toolResult(value);
  const explicit = isMcpResult(value) ? readExplicit(value) : undefined;
  if (explicit && !Object.hasOwn(explicit, "structuredContent")) {
    if (explicit.isError) return explicit;
    throw new Error(
      `Output schema requires structuredContent for tool: ${name}`,
    );
  }
  const parsed = await core.safeParseAsync(
    output,
    explicit ? explicit.structuredContent : value,
  );
  if (!parsed.success)
    throw new Error(`Invalid output for tool: ${name}`, {
      cause: parsed.error,
    });
  // The schema accepted these values; undefined optional properties are absent.
  const result = structuredResult(parsed.data, { omitUndefined: true });
  if (!explicit) return result;
  // Text serializing the raw data describes the parsed data after output parsing.
  const raw = JSON.stringify(explicit.structuredContent);
  const text = JSON.stringify(result.structuredContent);
  return withStructuredText({
    ...explicit,
    content: explicit.content.map((block) =>
      block.type === "text" && block.text === raw ? { ...block, text } : block,
    ),
    structuredContent: result.structuredContent,
  });
}

export function toolError(message: string): ToolExecutionResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
