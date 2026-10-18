import type { ContentBlock, MetaObject } from "@toolgrain/protocol";
import type { JsonCompatible } from "./json-value.js";

export interface McpResultOptions<Structured = unknown> {
  content: ContentBlock[];
  structuredContent?: Structured & JsonCompatible<NoInfer<Structured>>;
  isError?: boolean;
  _meta?: MetaObject;
}

export class McpResult<Structured> {
  declare private readonly resultBrand: undefined;

  constructor(readonly value: McpResultOptions<Structured>) {
    Object.freeze(this);
  }
}

export type McpErrorResult<Structured = never> = McpResult<Structured> & {
  readonly value: McpResultOptions<Structured> & { isError: true };
};

/** Explicitly return MCP content. Ordinary objects always remain application data. */
export function mcpResult(
  value: McpResultOptions<never> & { isError: true },
): McpErrorResult<never>;
export function mcpResult<Structured>(
  value: McpResultOptions<Structured> & { isError: true },
): McpErrorResult<Structured>;
export function mcpResult(value: McpResultOptions<never>): McpResult<never>;
export function mcpResult<Structured = never>(
  value: McpResultOptions<Structured>,
): McpResult<Structured>;
export function mcpResult<Structured = never>(
  value: McpResultOptions<Structured>,
): McpResult<Structured> {
  return new McpResult(value);
}
