import { ToolInputError } from "./errors.js";
import { createRegistry, type ToolMap } from "./registry.js";
import {
  resolveToolResult,
  type ToolExecutionResult,
  toolError,
} from "./results.js";
import { describeTool } from "./schema.js";

export function createToolAdapter(tools: ToolMap) {
  const registry = createRegistry(tools);
  const entries = registry.list();
  const names = new Set(entries.map(({ name }) => name));
  const outputs = new Map(entries.map(({ name, output }) => [name, output]));
  const listed = entries.map((entry) => describeTool(entry.name, entry));
  return {
    has: (name: string) => names.has(name),
    list: () => structuredClone(listed),
    async execute(
      name: string,
      input: unknown,
      isActive: () => boolean,
    ): Promise<ToolExecutionResult | undefined> {
      if (!names.has(name) || !isActive()) return;
      try {
        const result = await registry.execute(name, input);
        if (!isActive()) return;
        const converted = await resolveToolResult(
          name,
          result,
          outputs.get(name),
        );
        return isActive() ? converted : undefined;
      } catch (error) {
        if (!isActive()) return;
        if (error instanceof ToolInputError) {
          return toolError(
            error.issues
              .map(
                (issue) =>
                  `${issue.path.map(String).join(".") || "input"}: ${issue.message}`,
              )
              .join("; "),
          );
        }
        return toolError(
          error instanceof Error ? error.message : "Tool execution failed",
        );
      }
    },
  };
}
