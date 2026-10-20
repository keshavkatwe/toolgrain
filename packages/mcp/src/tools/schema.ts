import type { Tool as ProtocolTool } from "@toolgrain/protocol";
import { z } from "zod";
import { icon } from "../protocol/icon.js";
import { object } from "../protocol/messages.js";
import { TOOL_METADATA_KEYS } from "./definition.js";
import { assertJSON } from "./json-value.js";
import { validateToolName } from "./name.js";
import type { ToolMap } from "./registry.js";

export const toolAnnotations = z.looseObject({
  title: z.string().optional(),
  readOnlyHint: z.boolean().optional(),
  destructiveHint: z.boolean().optional(),
  idempotentHint: z.boolean().optional(),
  openWorldHint: z.boolean().optional(),
});

const metadata = z.strictObject({
  title: z.string().optional(),
  description: z.string().optional(),
  icons: z.array(icon).optional(),
  annotations: toolAnnotations.optional(),
  _meta: object.optional(),
});

export class ToolSchemaError extends Error {
  constructor(
    public readonly toolName: string,
    cause: unknown,
    public readonly schemaKind: "input" | "output" | "metadata" = "input",
  ) {
    super(`Cannot expose ${schemaKind} schema for tool: ${toolName}`, {
      cause,
    });
    this.name = "ToolSchemaError";
  }
}

export function describeTool(
  name: string,
  definition: Pick<
    ToolMap[string],
    | "input"
    | "output"
    | "title"
    | "description"
    | "icons"
    | "annotations"
    | "_meta"
  >,
): ProtocolTool {
  validateToolName(name);
  let schemaKind: "input" | "output" | "metadata" = "input";
  try {
    const inputSchema = z.toJSONSchema(definition.input, {
      io: "input",
      target: "draft-2020-12",
    });
    if (inputSchema.type !== "object")
      throw new Error("Tool input schema must have an object root");
    schemaKind = "output";
    const outputSchema =
      definition.output === undefined
        ? undefined
        : z.toJSONSchema(definition.output, {
            io: "output",
            target: "draft-2020-12",
          });
    schemaKind = "metadata";
    const fields: Record<string, unknown> = {};
    for (const key of TOOL_METADATA_KEYS)
      if (definition[key] !== undefined) fields[key] = definition[key];
    assertJSON(fields);
    metadata.parse(fields);
    const result = {
      name,
      inputSchema: { ...inputSchema, type: "object" },
      ...(outputSchema === undefined ? {} : { outputSchema }),
      ...fields,
    };
    return structuredClone(result) as ProtocolTool;
  } catch (cause) {
    throw new ToolSchemaError(name, cause, schemaKind);
  }
}
