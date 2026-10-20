import {
  createServer,
  mcpResult,
  type ToolContext,
  type Transport,
  type TransportCallbacks,
  tool,
  toolContext,
} from "@toolgrain/mcp";
import { type DiscoverResult, PROTOCOL_VERSION } from "@toolgrain/protocol";
import { z } from "zod";

let callbacks: TransportCallbacks | undefined;
const transport: Transport = {
  async start(value) {
    callbacks = value;
  },
  async send(message) {
    if ("result" in message && typeof message.result.resultType === "string") {
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
      title: "Greeting",
      annotations: { readOnlyHint: true },
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string() }),
      execute: ({ name }, ctx: ToolContext) =>
        mcpResult({
          content: [],
          structuredContent: { message: `Hello, ${name}:${ctx.request.id}` },
        }),
    }),
    textOnlyError: tool({
      input: z.object({}),
      output: z.number(),
      execute: () =>
        mcpResult({
          isError: true,
          content: [{ type: "text", text: "Unavailable" }],
        }),
    }),
    structuredError: tool({
      input: z.object({}),
      output: z.number(),
      execute: () =>
        mcpResult({ isError: true, content: [], structuredContent: 1 }),
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

function rejectedDefinitions() {
  // @ts-expect-error Compiled declarations preserve schema/handler checking.
  tool({ input: z.string(), execute: (value: number) => value });
  // @ts-expect-error Compiled declarations preserve output schema checking.
  tool({ input: z.object({}), output: z.number(), execute: () => "wrong" });
  // @ts-expect-error Compiled declarations reject non-JSON results without a schema.
  tool({ input: z.object({}), execute: () => new Date() });
  // @ts-expect-error Compiled declarations reject non-JSON structured content.
  mcpResult({ content: [], structuredContent: new Date() });
  // @ts-expect-error Compiled declarations reject non-JSON structured error content.
  mcpResult({ content: [], isError: true, structuredContent: new Date() });
  tool({
    input: z.object({}),
    // @ts-expect-error Compiled declarations reject invalid structured error data.
    output: z.number(),
    execute: () =>
      mcpResult({ content: [], isError: true, structuredContent: "wrong" }),
  });
  createServer({
    name: "invalid",
    version: "1",
    tools: {
      // @ts-expect-error Raw objects cannot bypass tool() checking.
      bad: { input: z.string(), execute: (value: number) => value },
    },
  });
}
void rejectedDefinitions;

const mutableClient = {
  info: {
    name: "client",
    version: "1",
    icons: [{ src: "icon.png", sizes: ["48x48"] }],
  },
  capabilities: { elicitation: { form: {} } },
};
const direct: ToolContext = toolContext({
  request: { id: "smoke", client: mutableClient },
});
toolContext({ request: direct.request });
const directVersion: "2026-07-28" | "2025-06-18" =
  direct.request.protocolVersion;
void directVersion;

function rejectedContextMutations(ctx: ToolContext) {
  const client = ctx.request.client;
  if (client?.info) {
    // @ts-expect-error Compiled declarations expose readonly client fields.
    client.info.name = "changed";
    // @ts-expect-error Compiled declarations expose readonly nested arrays.
    client.info.icons?.[0]?.sizes?.push("96x96");
  }
  if (client?.capabilities?.elicitation) {
    // @ts-expect-error Compiled declarations expose readonly nested capabilities.
    client.capabilities.elicitation.form = {};
  }
}
void rejectedContextMutations;
