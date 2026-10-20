import type * as core from "zod/v4/core";

export class UnknownToolError extends Error {
  constructor(public readonly toolName: string) {
    super(`Unknown tool: ${toolName}`);
    this.name = "UnknownToolError";
  }
}

export class ToolInputError extends Error {
  readonly issues: core.$ZodError["issues"];

  constructor(
    public readonly toolName: string,
    cause: core.$ZodError,
  ) {
    super(`Invalid input for tool: ${toolName}`, { cause });
    this.name = "ToolInputError";
    this.issues = cause.issues;
  }
}
