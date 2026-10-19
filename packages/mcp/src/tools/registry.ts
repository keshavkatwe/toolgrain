import type { ToolContext } from "./context.js";
import {
  isRegisteredTool,
  type RegisteredTool,
  type ToolMetadata,
} from "./definition.js";
import { ToolInputError, UnknownToolError } from "./errors.js";

export type ToolMap = Record<string, RegisteredTool>;

type ResultOf<T> = T extends { execute: (...args: never[]) => infer Result }
  ? Awaited<Result>
  : never;

export type ToolEntry<Tools extends ToolMap> = {
  [Name in keyof Tools & string]: ToolMetadata & {
    name: Name;
    description?: string;
    input: Tools[Name]["input"];
    output?: NonNullable<RegisteredTool["output"]>;
  };
}[keyof Tools & string];

export interface Registry<Tools extends ToolMap> {
  list(): ToolEntry<Tools>[];
  execute<Name extends keyof Tools & string>(
    name: Name,
    input: unknown,
    ctx: ToolContext,
  ): Promise<ResultOf<Tools[Name]>>;
  execute(
    name: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<ResultOf<Tools[keyof Tools & string]>>;
}

export function createRegistry<const Tools extends ToolMap>(
  tools: Tools,
): Registry<Tools> {
  const entries = new Map(
    Object.entries(tools).map(([name, definition]) => {
      if (!isRegisteredTool(definition))
        throw new TypeError(
          `Tool ${JSON.stringify(name)} must be created with tool()`,
        );
      return [name, Object.freeze({ ...definition })] as const;
    }),
  );

  return {
    list() {
      return Array.from(entries, ([name, definition]) => {
        const { execute: _execute, ...metadata } = definition;
        return { name, ...metadata };
      }) as ToolEntry<Tools>[];
    },
    async execute(name: string, input: unknown, ctx: ToolContext) {
      const definition = entries.get(name);
      if (!definition) throw new UnknownToolError(name);
      const parsed = await definition.input.safeParseAsync(input);
      if (!parsed.success) throw new ToolInputError(name, parsed.error);
      // A request cancelled during validation never starts its handler.
      ctx.signal.throwIfAborted();
      return definition.execute(parsed.data as never, ctx);
    },
  } as Registry<Tools>;
}
