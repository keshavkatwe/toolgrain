import type { ContentBlock, MetaObject } from "@toolgrain/protocol";
import type { DeepReadonly, JsonCompatible } from "./json-value.js";

/** Explicit MCP content and optional structured data, wrapped with `mcpResult()`. */
export interface McpResultOptions<Structured = unknown> {
  /** Content blocks for the client; readonly authoring arrays are accepted. */
  content: readonly DeepReadonly<ContentBlock>[];
  /** JSON-compatible data; required for successful rich results with a declared output schema. */
  structuredContent?: Structured & JsonCompatible<NoInfer<Structured>>;
  /** Marks an expected, client-visible tool failure; omitted or false indicates success. */
  isError?: boolean;
  /** Optional protocol result metadata, distinct from application structured data. */
  _meta?: MetaObject;
}

// Registered symbols let duplicate package copies recognize each other's results.
const RESULT_BRAND = Symbol.for("@toolgrain/mcp/result@1");

/**
 * Branded rich-result wrapper recognized by compatible Toolgrain package copies.
 * Use `mcpResult()` to construct one; a plain object with the same fields remains application data.
 */
export class McpResult<Structured> {
  constructor(
    /** Explicit MCP result envelope, before server validation and revision-specific conversion. */
    readonly value: McpResultOptions<Structured>,
  ) {
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

/** Explicit, client-visible tool error; structured data may be omitted for text-only errors. */
export type McpErrorResult<Structured = never> = McpResult<Structured> & {
  /** Envelope statically marked as an error. */
  readonly value: McpResultOptions<Structured> & {
    /** Explicit expected-failure marker, preserved in the MCP result. */
    isError: true;
  };
};

/** A result whose structured data is present, as required by an output schema. */
export type McpStructuredResult<Structured> = McpResult<Structured> & {
  /** Envelope with required application structured data. */
  readonly value: McpResultOptions<Structured> & {
    /** Structured value validated against the tool's output schema when one is declared. */
    structuredContent: Structured;
  };
};

/**
 * Explicitly return rich MCP content; ordinary result-shaped objects remain application data.
 * This overload wraps a public tool error that also supplies structured data.
 * @param value - Error content and JSON-compatible data, parsed by any declared output schema.
 * @returns A branded result typed as both an error and a structured result.
 */
export function mcpResult<Structured = never>(
  value: McpResultOptions<Structured> & {
    /** Mark this result as an expected, client-visible tool failure. */
    isError: true;
    /** Structured error data, subject to output-schema validation when declared. */
    structuredContent: Structured;
  },
): McpErrorResult<Structured> & McpStructuredResult<Structured>;
/**
 * Wrap a text/content-only public tool error, allowed even when the tool declares output.
 * @param value - Explicit error content without structured application data.
 * @returns A branded error result whose `isError` flag is statically true.
 */
export function mcpResult(
  value: McpResultOptions<never> & {
    /** Mark this result as an expected, client-visible tool failure. */
    isError: true;
  },
): McpErrorResult<never>;
/**
 * Wrap a public tool error with an optional structured-data contract.
 * @param value - Error content and any JSON-compatible structured data.
 * @returns A branded error result; provided structured data still undergoes output validation.
 */
export function mcpResult<Structured>(
  value: McpResultOptions<Structured> & {
    /** Mark this result as an expected, client-visible tool failure. */
    isError: true;
  },
): McpErrorResult<Structured>;
/**
 * Wrap rich content with required structured application data.
 * @param value - Client content and JSON-compatible data; a successful output-schema result needs both.
 * @returns A branded structured result; the server validates and converts it for the selected revision.
 */
export function mcpResult<Structured>(
  value: McpResultOptions<Structured> & {
    /** Required application data, parsed by the declared output schema when present. */
    structuredContent: Structured;
  },
): McpStructuredResult<Structured>;
/**
 * Wrap explicit client content without structured application data.
 * @param value - Rich content; successful results of this form require a tool without an output schema.
 * @returns A branded MCP result. Ordinary result-shaped objects are not treated as rich results.
 */
export function mcpResult(value: McpResultOptions<never>): McpResult<never>;
/**
 * Explicitly return MCP content instead of ordinary application JSON.
 * The server validates the envelope, parses supplied output data, and converts it for the protocol revision.
 *
 * @param value - Content blocks, optional structured data, an error marker, and protocol metadata.
 * @returns A frozen result wrapper; content is checked during server invocation.
 */
export function mcpResult<Structured = never>(
  value: McpResultOptions<Structured>,
): McpResult<Structured>;
export function mcpResult<Structured = never>(
  value: McpResultOptions<Structured>,
): McpResult<Structured> {
  return new McpResult(value);
}
