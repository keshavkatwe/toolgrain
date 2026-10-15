import { createRegistry, ToolInputError, type ToolMap } from "@toolgrain/core";
import type { CallToolResult } from "@toolgrain/protocol";
import { toolError, toolResult } from "./results.js";
import { describeTool } from "./tool-schema.js";

export function createToolAdapter(tools: ToolMap) {
  const snapshot = new Map(
    Object.entries(tools).map(([name, definition]) => [
      name,
      Object.freeze({ ...definition }),
    ]),
  );
  const listed = Array.from(snapshot, ([name, definition]) =>
    describeTool(name, definition),
  );
  return {
    has: (name: string) => snapshot.has(name),
    list: () => structuredClone(listed),
    async execute(
      name: string,
      input: unknown,
      isActive: () => boolean,
    ): Promise<CallToolResult | undefined> {
      const definition = snapshot.get(name);
      if (!definition || !isActive()) return;
      // The wrapper checks cancellation after core's asynchronous validation,
      // immediately before the handler, without changing the core API.
      const registry = createRegistry({
        [name]: {
          ...definition,
          execute(value: never) {
            if (!isActive()) return undefined;
            return definition.execute(value);
          },
        },
      });
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
