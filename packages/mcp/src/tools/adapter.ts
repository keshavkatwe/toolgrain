import type { Tool as ProtocolTool } from "@toolgrain/protocol";
import { type ErrorHandler, reportError } from "../diagnostics.js";
import type { ToolContext } from "./context.js";
import { ToolInputError } from "./errors.js";
import { createRegistry, type ToolMap } from "./registry.js";
import {
  resolveToolResult,
  type ToolExecutionResult,
  toolError,
} from "./results.js";
import { describeTool } from "./schema.js";

export interface ToolAdapter {
  has(name: string): boolean;
  list(): ProtocolTool[];
  execute(
    name: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<ToolExecutionResult | undefined>;
}

export function createToolAdapter(
  tools: ToolMap,
  onError?: ErrorHandler,
): ToolAdapter {
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
      ctx: ToolContext,
    ): Promise<ToolExecutionResult | undefined> {
      const isActive = () => !ctx.signal.aborted;
      if (!names.has(name) || !isActive()) return;
      try {
        const result = await registry.execute(name, input, ctx);
        if (!isActive()) return;
        const converted = await resolveToolResult(
          name,
          result,
          outputs.get(name),
        );
        return isActive() ? converted : undefined;
      } catch (error) {
        if (!isActive()) return;
        try {
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
        } catch {
          // Inspecting a thrown value can fail, including revoked or trapped proxies.
        }
        reportError(
          onError,
          error,
          Object.freeze({ toolName: name, request: ctx.request }),
        );
        return isActive() ? toolError("Tool execution failed") : undefined;
      }
    },
  };
}
