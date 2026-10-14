import type { z } from "zod";

export class UnknownToolError extends Error {
  constructor(public readonly toolName: string) {
    super(`Unknown tool: ${toolName}`);
    this.name = "UnknownToolError";
  }
}

export class ToolInputError extends Error {
  readonly issues: z.ZodError["issues"];

  constructor(
    public readonly toolName: string,
    cause: z.ZodError,
  ) {
    super(`Invalid input for tool: ${toolName}`, { cause });
    this.name = "ToolInputError";
    this.issues = cause.issues;
  }
}
