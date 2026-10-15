import type { ToolMap } from "@toolgrain/core";
import type { Tool as ProtocolTool } from "@toolgrain/protocol";
import { z } from "zod";

export class ToolSchemaError extends Error {
  constructor(
    public readonly toolName: string,
    cause: unknown,
  ) {
    super(`Cannot expose input schema for tool: ${toolName}`, { cause });
    this.name = "ToolSchemaError";
  }
}

export function describeTool(
  name: string,
  definition: ToolMap[string],
): ProtocolTool {
  try {
    const inputSchema = z.toJSONSchema(definition.input, {
      io: "input",
      target: "draft-2020-12",
    });
    if (inputSchema.type !== "object")
      throw new Error("Tool input schema must have an object root");
    return {
      name,
      inputSchema: { ...inputSchema, type: "object" },
      ...(definition.description === undefined
        ? {}
        : { description: definition.description }),
    };
  } catch (cause) {
    throw new ToolSchemaError(name, cause);
  }
}
