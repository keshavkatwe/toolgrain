import {
  AuthError,
  type ContextProvider,
  createContext,
  createServer,
  mcpResult,
  type ToolContext,
  type Transport,
  type TransportCallbacks,
  tool,
  toolContext,
  validateTokenAudience,
} from "@toolgrain/mcp";
import {
  type DiscoverResult,
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from "@toolgrain/protocol";
import type {
  ClientCapabilities as LegacyClientCapabilities,
  Implementation as LegacyImplementation,
} from "@toolgrain/protocol/2025-06-18";
import { z } from "zod";
import * as mini from "zod/v4/mini";

const miniInput = mini.object({
  count: mini.pipe(mini._default(mini.string(), "2"), mini.transform(Number)),
});
const miniTool = tool({
  input: miniInput,
  output: mini.object({ count: mini.string() }),
  execute: ({ count }) => ({ count: count.toFixed() }),
});
const preservedMiniInput: typeof miniInput = miniTool.input;
const miniReturn: { count: string } = miniTool.execute(
  { count: 2 },
  toolContext(),
);
void preservedMiniInput;
void miniReturn;

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
    mini: miniTool,
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
  const wrongError = () =>
    mcpResult({ content: [], isError: true, structuredContent: "wrong" });
  // @ts-expect-error Compiled declarations infer Mini's parsed input type.
  tool({ input: miniInput, execute: ({ count }: { count: string }) => count });
  // @ts-expect-error Compiled declarations check Mini output schemas.
  tool({ input: miniInput, output: mini.number(), execute: () => "wrong" });
  // @ts-expect-error Compiled declarations check Mini structured error results.
  tool({ input: miniInput, output: mini.number(), execute: wrongError });
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
  // @ts-expect-error Compiled declarations reject invalid structured error data.
  tool({ input: z.object({}), output: z.number(), execute: wrongError });
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

const legacyInfo: LegacyImplementation = { name: "legacy", version: "1" };
const legacyCapabilities: LegacyClientCapabilities = {
  roots: { listChanged: true },
  sampling: { tools: false },
  elicitation: { form: null },
};
toolContext({
  request: {
    protocolVersion: LEGACY_PROTOCOL_VERSION,
    client: { info: legacyInfo, capabilities: legacyCapabilities },
  },
});

function rejectedContextMutations(ctx: ToolContext) {
  const client = ctx.request.client;
  if (client?.info) {
    // @ts-expect-error Compiled declarations expose readonly client fields.
    client.info.name = "changed";
    if ("icons" in client.info) {
      // @ts-expect-error Compiled declarations expose readonly nested arrays.
      client.info.icons?.[0]?.sizes?.push("96x96");
    }
  }
  const capabilities = client?.capabilities;
  if (capabilities?.experimental) {
    // @ts-expect-error Compiled declarations expose readonly records in both eras.
    capabilities.experimental["com.example/test"] = {};
  }
  if (capabilities && "extensions" in capabilities) {
    const extension = capabilities.extensions?.["com.example/test"];
    if (extension) {
      // @ts-expect-error Compiled declarations expose deeply readonly capabilities.
      extension["com.example/enabled"] = true;
    }
  }
}
void rejectedContextMutations;

function rejectedClientAssumptions(ctx: ToolContext) {
  const name: string | undefined = ctx.request.client?.info?.name;
  void name;
  // @ts-expect-error Legacy client information does not declare icons.
  ctx.request.client?.info?.icons;
  // @ts-expect-error Legacy elicitation does not declare a form field.
  ctx.request.client?.capabilities?.elicitation?.form;
  if (ctx.request.protocolVersion === PROTOCOL_VERSION) {
    // @ts-expect-error ToolRequest stays one shape; checking the version does not narrow info.
    ctx.request.client?.info?.icons;
    // @ts-expect-error ToolRequest stays one shape; checking the version does not narrow capabilities.
    ctx.request.client?.capabilities?.sampling?.tools;
  }
}
void rejectedClientAssumptions;

const databaseContext = createContext({
  name: "database",
  resolve: (ctx) => ({
    requestId: ctx.request.id,
    query: (id: number) => id.toFixed(),
  }),
});
const useDatabase = databaseContext.use;
const serviceContext = createContext({
  name: "services",
  async resolve(ctx) {
    const db = await useDatabase(ctx);
    return { read: () => db.query(1) };
  },
});
const inferredContext: ContextProvider<{ read: () => string }> = serviceContext;
const overriddenContext = databaseContext.provide(async () => ({
  requestId: "test",
  query: () => "fake",
}));
const providerContext: ToolContext = toolContext({
  context: [serviceContext, overriddenContext],
});
const inferredValue: { read: () => string } =
  await serviceContext.use(providerContext);
createServer({
  name: "context",
  version: "1",
  tools: {},
  context: [serviceContext, databaseContext],
});
void inferredContext;
void inferredValue;
function rejectedContextProviders() {
  // @ts-expect-error Compiled declarations preserve inferred override types.
  databaseContext.provide(() => ({ requestId: 1, query: () => 2 }));
  // @ts-expect-error Raw providers cannot bypass opaque registration.
  toolContext({ context: [{ name: "raw", resolve: () => 1 }] });
  // @ts-expect-error Context access is always asynchronous.
  const eager: { read: () => string } = serviceContext.use(toolContext());
  void eager;
  // @ts-expect-error Compiled declarations keep override contracts invariant.
  const widened: ContextProvider<unknown> = databaseContext;
  void widened;
}
void rejectedContextProviders;

validateTokenAudience(
  "https://api.example.com/mcp",
  "https://api.example.com/mcp",
);
const authFailure = new AuthError("invalid_token", {
  description: "Public audience guidance",
  cause: new Error("private diagnostic"),
});
const publicDescription: string | undefined = authFailure.description;
void publicDescription;
