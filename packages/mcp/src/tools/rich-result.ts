import type { ContentBlock, MetaObject } from "@toolgrain/protocol";
import type { DeepReadonly, JsonCompatible } from "./json-value.js";

export interface McpResultOptions<Structured = unknown> {
  content: readonly DeepReadonly<ContentBlock>[];
  structuredContent?: Structured & JsonCompatible<NoInfer<Structured>>;
  isError?: boolean;
  _meta?: MetaObject;
}

// Registered symbols let duplicate package copies recognize each other's results.
const RESULT_BRAND = Symbol.for("@toolgrain/mcp/result@1");

export class McpResult<Structured> {
  constructor(readonly value: McpResultOptions<Structured>) {
    Object.freeze(this);
  }

  /** Structural brand shared by package copies; object spreads do not keep it. */
  "~toolgrain"(): "result@1" {
    return "result@1";
  }
}
Object.defineProperty(McpResult.prototype, RESULT_BRAND, { value: true });

/** Recognize results created by any compatible copy of this package. */
export function isMcpResult(value: unknown): value is McpResult<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [RESULT_BRAND]?: unknown })[RESULT_BRAND] === true
  );
}

export type McpErrorResult<Structured = never> = McpResult<Structured> & {
  readonly value: McpResultOptions<Structured> & { isError: true };
};

/** A result whose structured data is present, as required by an output schema. */
export type McpStructuredResult<Structured> = McpResult<Structured> & {
  readonly value: McpResultOptions<Structured> & {
    structuredContent: Structured;
  };
};

/** Explicitly return MCP content. Ordinary objects always remain application data. */
export function mcpResult<Structured = never>(
  value: McpResultOptions<Structured> & {
    isError: true;
    structuredContent: Structured;
  },
): McpErrorResult<Structured> & McpStructuredResult<Structured>;
export function mcpResult(
  value: McpResultOptions<never> & { isError: true },
): McpErrorResult<never>;
export function mcpResult<Structured>(
  value: McpResultOptions<Structured> & { isError: true },
): McpErrorResult<Structured>;
export function mcpResult<Structured>(
  value: McpResultOptions<Structured> & { structuredContent: Structured },
): McpStructuredResult<Structured>;
export function mcpResult(value: McpResultOptions<never>): McpResult<never>;
export function mcpResult<Structured = never>(
  value: McpResultOptions<Structured>,
): McpResult<Structured>;
export function mcpResult<Structured = never>(
  value: McpResultOptions<Structured>,
): McpResult<Structured> {
  return new McpResult(value);
}
