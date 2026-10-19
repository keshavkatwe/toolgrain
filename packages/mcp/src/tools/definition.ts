import type { Tool as ProtocolTool } from "@toolgrain/protocol";
import type { z } from "zod";
import type { ToolContext } from "./context.js";
import type { IsJsonCompatible, JsonCompatible } from "./json-value.js";
import type { McpResult } from "./rich-result.js";

export const TOOL_METADATA_KEYS = [
  "title",
  "description",
  "annotations",
  "icons",
  "_meta",
] as const;

export type ToolMetadata = Pick<
  ProtocolTool,
  "title" | "description" | "annotations" | "icons" | "_meta"
>;

export interface ToolDefinition<
  Schema extends z.ZodType,
  Result,
  Output extends z.ZodType = never,
> extends ToolMetadata {
  readonly input: Schema;
  readonly output?: Output;
  /** Raw handler; server invocation performs validation and result conversion. */
  readonly execute: (input: z.output<Schema>, ctx: ToolContext) => Result;
}

// Registered symbols let duplicate package copies recognize each other's tools.
const TOOL_BRAND = Symbol.for("@toolgrain/mcp/tool@1");

/** Internal erased type for heterogeneous, schema-checked registrations. */
export abstract class RegisteredTool {
  abstract readonly input: z.ZodType;
  abstract readonly output?: z.ZodType;
  abstract readonly execute: (input: never, ctx: ToolContext) => unknown;
  abstract readonly title?: string;
  abstract readonly description?: string;
  abstract readonly annotations?: NonNullable<ProtocolTool["annotations"]>;
  abstract readonly icons?: NonNullable<ProtocolTool["icons"]>;
  abstract readonly _meta?: NonNullable<ProtocolTool["_meta"]>;

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

export class Tool<Schema extends z.ZodType, Result> extends RegisteredTool {
  declare readonly input: Schema;
  declare readonly output?: z.ZodType;
  declare readonly execute: (
    input: z.output<Schema>,
    ctx: ToolContext,
  ) => Result;
  declare readonly title?: string;
  declare readonly description?: string;
  declare readonly annotations?: NonNullable<ProtocolTool["annotations"]>;
  declare readonly icons?: NonNullable<ProtocolTool["icons"]>;
  declare readonly _meta?: NonNullable<ProtocolTool["_meta"]>;

  constructor(definition: ToolDefinition<Schema, Result, z.ZodType>) {
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

type OutputResult<Output extends z.ZodType> =
  | z.input<Output>
  | McpResult<z.input<Output>>;

type JsonSafeOutput<Result> =
  Result extends PromiseLike<infer Resolved>
    ? PromiseLike<JsonSafeOutput<Resolved>>
    : Result extends McpResult<infer Structured>
      ? IsJsonCompatible<Structured> extends true
        ? Result
        : never
      : JsonCompatible<Result>;

type ToolDefinitionWithoutOutput<Schema extends z.ZodType, Result> = Omit<
  ToolDefinition<Schema, Result>,
  "execute"
> & {
  readonly execute: (
    input: z.output<Schema>,
    ctx: ToolContext,
  ) => Result & JsonSafeOutput<Result>;
};

export function tool<
  Schema extends z.ZodType,
  Output extends z.ZodType,
  Result extends
    | OutputResult<NoInfer<Output>>
    | PromiseLike<OutputResult<NoInfer<Output>>>,
>(
  definition: ToolDefinition<Schema, Result, Output> & {
    readonly output: Output;
  },
): Tool<Schema, Result>;
export function tool<Schema extends z.ZodType, Result>(
  definition: ToolDefinitionWithoutOutput<Schema, Result>,
): Tool<Schema, Result>;
/** Define a reusable MCP tool. Its execute property remains the raw handler. */
export function tool<Schema extends z.ZodType, Result>(
  definition: ToolDefinition<Schema, Result, z.ZodType>,
): Tool<Schema, Result> {
  return new Tool(definition);
}
