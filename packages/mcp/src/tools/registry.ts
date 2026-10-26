import * as core from "zod/v4/core";
import type { ToolContext } from "./context.js";
import {
  isRegisteredTool,
  type RegisteredTool,
  type ToolMetadata,
} from "./definition.js";
import { ToolInputError, UnknownToolError } from "./errors.js";

/**
 * Tools indexed by exposed MCP names. Values must be frozen definitions made with `tool()`;
 * names come from these keys, not from a definition's variable name or title.
 */
export type ToolMap = Record<string, RegisteredTool>;

export interface ToolEntry extends ToolMetadata {
  name: string;
  input: RegisteredTool["input"];
  output?: NonNullable<RegisteredTool["output"]>;
}

export interface Registry {
  list(): ToolEntry[];
  execute(name: string, input: unknown, ctx: ToolContext): Promise<unknown>;
}

export function createRegistry(tools: ToolMap): Registry {
  const entries = new Map(
    Object.entries(tools).map(([name, definition]) => {
      if (!isRegisteredTool(definition))
        throw new TypeError(
          `Tool ${JSON.stringify(name)} must be created with tool()`,
        );
      return [name, Object.freeze({ ...definition })] as const;
    }),
  );

  return {
    list() {
      return Array.from(entries, ([name, definition]) => {
        const { execute: _execute, ...metadata } = definition;
        return { name, ...metadata };
      });
    },
    async execute(name, input, ctx) {
      const definition = entries.get(name);
      if (!definition) throw new UnknownToolError(name);
      const parsed = await core.safeParseAsync(definition.input, input);
      if (!parsed.success) throw new ToolInputError(name, parsed.error);
      // A request cancelled during validation never starts its handler.
      ctx.signal.throwIfAborted();
      // Parsing with this definition's schema establishes its handler input type.
      return definition.execute(parsed.data as never, ctx);
    },
  };
}
