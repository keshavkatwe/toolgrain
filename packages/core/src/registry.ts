import type { z } from "zod";
import { ToolInputError, UnknownToolError } from "./errors.js";

// `never` permits heterogeneous handler inputs without exposing `any`.
export type ToolMap = Record<
  string,
  {
    readonly description?: string;
    readonly input: z.ZodType;
    readonly execute: (input: never) => unknown;
  }
>;

type ResultOf<T> = T extends { execute: (...args: never[]) => infer Result }
  ? Awaited<Result>
  : never;

export type ToolEntry<Tools extends ToolMap> = {
  [Name in keyof Tools & string]: {
    name: Name;
    description?: string;
    input: Tools[Name]["input"];
  };
}[keyof Tools & string];

export interface Registry<Tools extends ToolMap> {
  list(): ToolEntry<Tools>[];
  execute<Name extends keyof Tools & string>(
    name: Name,
    input: unknown,
  ): Promise<ResultOf<Tools[Name]>>;
  execute(
    name: string,
    input: unknown,
  ): Promise<ResultOf<Tools[keyof Tools & string]>>;
}

export function createRegistry<const Tools extends ToolMap>(
  tools: Tools,
): Registry<Tools> {
  const entries = new Map(
    Object.entries(tools).map(([name, definition]) => [
      name,
      Object.freeze({ ...definition }),
    ]),
  );

  return {
    list() {
      return Array.from(entries, ([name, definition]) => ({
        name,
        input: definition.input,
        ...(definition.description === undefined
          ? {}
          : { description: definition.description }),
      })) as ToolEntry<Tools>[];
    },
    async execute(name: string, input: unknown) {
      const definition = entries.get(name);
      if (!definition) throw new UnknownToolError(name);
      const parsed = await definition.input.safeParseAsync(input);
      if (!parsed.success) throw new ToolInputError(name, parsed.error);
      return definition.execute(parsed.data as never);
    },
  } as Registry<Tools>;
}
