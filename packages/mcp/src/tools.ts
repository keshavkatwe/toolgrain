import { createRegistry, ToolInputError, type ToolMap } from "@toolgrain/core";
import { type ToolExecutionResult, toolError, toolResult } from "./results.js";
import { describeTool } from "./tool-schema.js";

export function createToolAdapter(tools: ToolMap) {
  const registry = createRegistry(tools);
  const entries = registry.list();
  const names = new Set(entries.map(({ name }) => name));
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
        return toolResult(result);
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
