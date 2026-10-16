import type { ToolMap } from "@toolgrain/core";
import type {
  ProtocolResponse,
  Tool as ProtocolTool,
  SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { LEGACY_PROTOCOL_VERSION } from "@toolgrain/protocol";
import { createConnection } from "./connection.js";
import { createDispatcher } from "./dispatcher.js";
import { executeRequest } from "./execute-request.js";
import { decode } from "./protocol/decode.js";
import { createToolAdapter } from "./tools.js";
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
  const connection = createConnection(dispatch, options.onError, () => {
    closed = true;
  });
  return {
    listen: connection.listen,
    getToolDefinitions: () => tools.list(),
    async handle(message, { signal, protocolVersion } = {}) {
      if (closed) throw new Error("Server is closed");
      const active = () => !closed && !signal?.aborted;
      if (!active()) return;
      const incoming = decode(message);
      if (incoming.kind === "error")
        return protocolVersion === LEGACY_PROTOCOL_VERSION
          ? { ...incoming.response, id: incoming.response.id ?? null }
          : incoming.response;
      if (incoming.kind !== "request") return;
      return executeRequest(
        dispatch,
        incoming.request,
        active,
        options.onError,
        protocolVersion,
      );
    },
    close() {
      closed = true;
      return connection.close();
    },
  };
}
