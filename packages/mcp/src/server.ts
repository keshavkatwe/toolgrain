import type {
  ProtocolResponse,
  Tool as ProtocolTool,
  SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { createConnection } from "./connection.js";
import { createDispatcher, formatErrorResponse } from "./dispatcher.js";
import { executeRequest } from "./execute-request.js";
import { decode } from "./protocol/decode.js";
import { createToolAdapter } from "./tools/adapter.js";
import type { ToolMap } from "./tools/registry.js";
import type { Transport } from "./transport.js";

export interface ServerOptions<Tools extends ToolMap = ToolMap> {
  name: string;
  version: string;
  tools: Tools;
  instructions?: string;
  onError?: (error: unknown) => void;
}

export interface HandleOptions {
  signal?: AbortSignal;
  protocolVersion?: SupportedProtocolVersion;
}

export interface Server {
  handle(
    message: unknown,
    options?: HandleOptions,
  ): Promise<ProtocolResponse | undefined>;
  getToolDefinitions(): ProtocolTool[];
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
  let closed = false;
  const running = new Set<AbortController>();
  const closeIndependent = () => {
    closed = true;
    for (const controller of running)
      controller.abort(new DOMException("Server closed", "AbortError"));
    running.clear();
  };
  const connection = createConnection(
    dispatch,
    options.onError,
    closeIndependent,
  );
  return {
    listen: connection.listen,
    getToolDefinitions: () => tools.list(),
    async handle(message, { signal, protocolVersion } = {}) {
      if (closed) throw new Error("Server is closed");
      const active = () => !closed && !signal?.aborted;
      if (!active()) return;
      const incoming = decode(message);
      if (incoming.kind === "error")
        return formatErrorResponse(incoming.response, protocolVersion);
      if (incoming.kind !== "request") return;
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });
      running.add(controller);
      try {
        return await executeRequest(
          dispatch,
          incoming.request,
          { signal: controller.signal },
          options.onError,
          protocolVersion,
        );
      } finally {
        signal?.removeEventListener("abort", abort);
        running.delete(controller);
      }
    },
    close() {
      closeIndependent();
      return connection.close();
    },
  };
}
