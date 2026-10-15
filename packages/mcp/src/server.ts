import type { ToolMap } from "@toolgrain/core";
import { createConnection } from "./connection.js";
import { createDispatcher } from "./dispatcher.js";
import { createToolAdapter } from "./tools.js";
import type { Transport } from "./transport.js";

export interface ServerOptions<Tools extends ToolMap = ToolMap> {
  name: string;
  version: string;
  tools: Tools;
  instructions?: string;
  onError?: (error: unknown) => void;
}

export interface Server {
  listen(transport: Transport): Promise<void>;
  close(): Promise<void>;
}

/** Compose the tool adapter, MCP dispatcher, and transport connection. */
export function createServer<const Tools extends ToolMap>(
  options: ServerOptions<Tools>,
): Server {
  const tools = createToolAdapter(options.tools);
  const dispatch = createDispatcher(
    tools,
    { name: options.name, version: options.version },
    options.instructions,
  );
  return createConnection(dispatch, options.onError);
}
