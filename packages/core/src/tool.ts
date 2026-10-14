import type { z } from "zod";

export interface Tool<Schema extends z.ZodType, Result> {
  readonly description?: string;
  readonly input: Schema;
  readonly execute: (input: z.output<Schema>) => Result;
}

export function tool<Schema extends z.ZodType, Result>(
  definition: Tool<Schema, Result>,
): Tool<Schema, Result> {
  return Object.freeze({ ...definition });
}
