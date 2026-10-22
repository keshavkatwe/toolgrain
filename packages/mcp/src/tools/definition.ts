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

export type ToolMetadata = DeepReadonly<
  Pick<ProtocolTool, (typeof TOOL_METADATA_KEYS)[number]>
>;

export interface ToolDefinition<
  Schema extends core.$ZodType,
  Result,
  Output extends core.$ZodType = never,
> extends ToolMetadata {
  readonly input: Schema;
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

export class Tool<
  Schema extends core.$ZodType,
  Result,
  Output extends core.$ZodType = core.$ZodType,
> extends RegisteredTool {
  declare readonly input: Schema;
  declare readonly output?: Output;
  declare readonly execute: (
    input: core.output<Schema>,
    ctx: ToolContext,
  ) => Result;
  declare readonly title?: string;
  declare readonly description?: string;
  declare readonly annotations?: NonNullable<ToolMetadata["annotations"]>;
  declare readonly icons?: NonNullable<ToolMetadata["icons"]>;
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
  readonly execute: (
    input: core.output<Schema>,
    ctx: ToolContext,
  ) => Result & JsonSafeOutput<Result>;
};

export function tool<
  Schema extends core.$ZodType,
  Output extends core.$ZodType,
  Result extends
    | OutputResult<NoInfer<Output>>
    | PromiseLike<OutputResult<NoInfer<Output>>>,
>(
  definition: ToolDefinition<Schema, Result, Output> & {
    readonly output: Output;
  },
): Tool<Schema, Result, Output> & { readonly output: Output };
export function tool<Schema extends core.$ZodType, Result>(
  definition: ToolDefinitionWithoutOutput<Schema, Result>,
): Tool<Schema, Result, never>;
/** Define a reusable MCP tool. Its execute property remains the raw handler. */
export function tool<Schema extends core.$ZodType, Result>(
  definition: ToolDefinition<Schema, Result, core.$ZodType>,
): Tool<Schema, Result> {
  return new Tool(definition);
}
