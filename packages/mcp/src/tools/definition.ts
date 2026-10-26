import type { Tool as ProtocolTool } from "@toolgrain/protocol";
import type * as core from "zod/v4/core";
import type { ToolContext } from "./context.js";
import type {
  DeepReadonly,
  IsJsonCompatible,
  JsonCompatible,
} from "./json-value.js";
import type {
  McpErrorResult,
  McpResult,
  McpStructuredResult,
} from "./rich-result.js";

export const TOOL_METADATA_KEYS = [
  "title",
  "description",
  "annotations",
  "icons",
  "_meta",
] as const;

/**
 * Optional client-facing tool title, description, behavior hints, icons, and `_meta`.
 * Accepts readonly authoring data; registration checks JSON compatibility and copies
 * metadata for wire descriptions. Hints describe behavior rather than enforce policy.
 */
export type ToolMetadata = DeepReadonly<
  Pick<ProtocolTool, (typeof TOOL_METADATA_KEYS)[number]>
>;

/**
 * Authoring contract for `tool()`; handler input uses the parsed Zod output type.
 *
 * @typeParam Schema - Zod 4 Classic or Mini input schema with an exposable object root.
 * @typeParam Result - Raw handler return value, including a promise-like value.
 * @typeParam Output - Optional Zod output schema; the handler returns its input type.
 */
export interface ToolDefinition<
  Schema extends core.$ZodType,
  Result,
  Output extends core.$ZodType = never,
> extends ToolMetadata {
  /** Input schema, parsed asynchronously by the server before the handler runs. */
  readonly input: Schema;
  /** Optional output schema, parsed asynchronously before successful result conversion. */
  readonly output?: Output;
  /** Raw handler; server invocation performs validation and result conversion. */
  readonly execute: (input: core.output<Schema>, ctx: ToolContext) => Result;
}

// Registered symbols let duplicate package copies recognize each other's tools.
const TOOL_BRAND = Symbol.for("@toolgrain/mcp/tool@1");

/** Internal erased type for heterogeneous, schema-checked registrations. */
export abstract class RegisteredTool {
  abstract readonly input: core.$ZodType;
  abstract readonly output?: core.$ZodType;
  abstract readonly execute: (input: never, ctx: ToolContext) => unknown;
  abstract readonly title?: string;
  abstract readonly description?: string;
  abstract readonly annotations?: NonNullable<ToolMetadata["annotations"]>;
  abstract readonly icons?: NonNullable<ToolMetadata["icons"]>;
  abstract readonly _meta?: NonNullable<ToolMetadata["_meta"]>;

  /**
   * Structural brand shared by package copies. Object spreads drop prototype
   * methods, so modified spreads must pass through tool() again.
   */
  "~toolgrain"(): "tool@1" {
    return "tool@1";
  }
}
Object.defineProperty(RegisteredTool.prototype, TOOL_BRAND, { value: true });

/** Recognize definitions created by any compatible copy of this package. */
export function isRegisteredTool(value: unknown): value is RegisteredTool {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [TOOL_BRAND]?: unknown })[TOOL_BRAND] === true
  );
}

/**
 * Frozen, reusable tool definition returned by `tool()`. Register the same definition
 * under different keys or create typed variants by passing a spread through `tool()` again.
 * Direct `execute()` calls remain raw application calls.
 *
 * @typeParam Schema - Input schema whose parsed output is passed to the handler.
 * @typeParam Result - Raw handler return type, before server output parsing and conversion.
 * @typeParam Output - Output schema when declared by the definition.
 */
export class Tool<
  Schema extends core.$ZodType,
  Result,
  Output extends core.$ZodType = core.$ZodType,
> extends RegisteredTool {
  /** Zod input schema used by server validation; defaults and transforms run asynchronously. */
  declare readonly input: Schema;
  /** Optional Zod output schema used by server result validation. */
  declare readonly output?: Output;
  /** Raw handler; direct calls bypass authorization, input/output parsing, and MCP conversion. */
  declare readonly execute: (
    input: core.output<Schema>,
    ctx: ToolContext,
  ) => Result;
  /** Optional human-readable title advertised to clients. */
  declare readonly title?: string;
  /** Optional description explaining the tool's purpose and behavior to clients. */
  declare readonly description?: string;
  /** Client-facing behavior hints; Toolgrain does not enforce their assertions. */
  declare readonly annotations?: NonNullable<ToolMetadata["annotations"]>;
  /** Optional client-facing icon descriptors, with readonly authoring inputs. */
  declare readonly icons?: NonNullable<ToolMetadata["icons"]>;
  /** Optional JSON-compatible protocol metadata advertised with the tool. */
  declare readonly _meta?: NonNullable<ToolMetadata["_meta"]>;

  constructor(definition: ToolDefinition<Schema, Result, core.$ZodType>) {
    super();
    this.input = definition.input;
    this.execute = definition.execute;
    for (const key of ["output", ...TOOL_METADATA_KEYS] as const) {
      const value = definition[key];
      if (value !== undefined)
        Object.defineProperty(this, key, { value, enumerable: true });
    }
    Object.freeze(this);
  }
}

type OutputResult<Output extends core.$ZodType> =
  | core.input<Output>
  | McpStructuredResult<core.input<Output>>
  | McpErrorResult<core.input<Output>>;

type JsonSafeOutput<Result> =
  Result extends PromiseLike<infer Resolved>
    ? PromiseLike<JsonSafeOutput<Resolved>>
    : Result extends McpResult<infer Structured>
      ? IsJsonCompatible<Structured> extends true
        ? Result
        : never
      : JsonCompatible<Result>;

type ToolDefinitionWithoutOutput<Schema extends core.$ZodType, Result> = Omit<
  ToolDefinition<Schema, Result>,
  "execute"
> & {
  /** Raw handler accepting parsed input; server invocation validates its JSON-compatible result. */
  readonly execute: (
    input: core.output<Schema>,
    ctx: ToolContext,
  ) => Result & JsonSafeOutput<Result>;
};

/**
 * Define a frozen tool with asynchronously validated input and declared output.
 * Successful rich results must include `structuredContent`; explicit text-only errors may omit it.
 *
 * @param definition - Zod schemas, a handler returning the output schema's input type, and metadata.
 * @returns A reusable tool retaining input, output, and handler inference.
 * Its `execute` property stays raw; server invocation performs validation and conversion.
 */
export function tool<
  Schema extends core.$ZodType,
  Output extends core.$ZodType,
  Result extends
    | OutputResult<NoInfer<Output>>
    | PromiseLike<OutputResult<NoInfer<Output>>>,
>(
  definition: ToolDefinition<Schema, Result, Output> & {
    /** Required output schema for this overload; parses handler data before MCP conversion. */
    readonly output: Output;
  },
): Tool<Schema, Result, Output> & {
  /** Declared output schema, retained as required on the inferred tool type. */
  readonly output: Output;
};
/**
 * Define a frozen tool without an output schema, preserving the handler's inferred return type.
 * Ordinary strings and JSON values become MCP results; use `mcpResult()` for rich content.
 *
 * @param definition - Zod input schema, a JSON-compatible or explicit-result handler, and metadata.
 * @returns A reusable tool whose direct `execute()` calls bypass server validation and conversion.
 */
export function tool<Schema extends core.$ZodType, Result>(
  definition: ToolDefinitionWithoutOutput<Schema, Result>,
): Tool<Schema, Result, never>;
/** Define a reusable MCP tool. Its execute property remains the raw handler. */
export function tool<Schema extends core.$ZodType, Result>(
  definition: ToolDefinition<Schema, Result, core.$ZodType>,
): Tool<Schema, Result> {
  return new Tool(definition);
}
