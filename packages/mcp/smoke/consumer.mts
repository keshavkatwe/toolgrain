import { tool } from "@toolgrain/core";
import {
  createServer,
  type Transport,
  type TransportCallbacks,
} from "@toolgrain/mcp";
import { type DiscoverResult, PROTOCOL_VERSION } from "@toolgrain/protocol";
import { z } from "zod";

let callbacks: TransportCallbacks | undefined;
const transport: Transport = {
  async start(value) {
    callbacks = value;
  },
  async send(message) {
    if ("result" in message) {
      const revision: string = PROTOCOL_VERSION;
      const resultType: string = message.result.resultType;
      void revision;
      void resultType;
    }
  },
  async close() {
    callbacks = undefined;
  },
};
const server = createServer({
  name: "smoke",
  version: "1.0",
  tools: {
    greet: tool({
      input: z.object({ name: z.string() }),
      execute: ({ name }) => `Hello, ${name}!`,
    }),
  },
});
await server.listen(transport);
callbacks?.onMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
await server.close();
const discovery: DiscoverResult = {
  resultType: "complete",
  ttlMs: 0,
  cacheScope: "private",
  supportedVersions: [PROTOCOL_VERSION],
  capabilities: { tools: {} },
};
void discovery;
