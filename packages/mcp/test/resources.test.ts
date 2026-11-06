import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type Resource as ProtocolResource,
} from "@toolgrain/protocol";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  AuthError,
  createAuthAccessor,
  createContext,
  createServer,
  type Resource,
  type ResourceDefinition,
  type ResourceReadResult,
  resource,
  type ToolContext,
  toolContext,
} from "../src/index.js";
import { ProtocolError } from "../src/protocol/responses.js";
import { deferred, MemoryTransport } from "./memory.js";

const uri = "docs://guide";
const payload = { contents: [{ uri, text: "Guide", mimeType: "text/plain" }] };
const definition = () => resource({ uri, name: "guide", read: () => payload });
const setup = (resources: readonly Resource[] = [definition()]) =>
  createServer({ name: "resources", version: "1", tools: {}, resources });
const versions = [PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const;
type Version = (typeof versions)[number];
function request(
  version: Version,
  method: string,
  params: Record<string, unknown> = {},
) {
  return {
    jsonrpc: "2.0",
    id: "resource",
    method,
    params: {
      ...(version === PROTOCOL_VERSION
        ? {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": version,
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          }
        : {}),
      ...params,
    },
  };
}

it("preserves inferred direct results, readonly inputs, and the reusable definition brand", () => {
  const value = { contents: [{ uri, text: "Raw" }] } as const;
  const original = resource({
    uri,
    name: "guide",
    icons: [{ src: "icon.png", sizes: ["48x48"] }],
    read: () => value,
  });
  expectTypeOf(original.read(uri, toolContext())).toEqualTypeOf<typeof value>();
  expect(original.read(uri, toolContext())).toBe(value);
  expect(Object.isFrozen(original)).toBe(true);
  expect(original["~toolgrain"]()).toBe("resource@1");
  expect({ ...original }).not.toHaveProperty("~toolgrain");
  const variant = resource({ ...original, uri: "docs://variant" });
  setup([original, variant] as const);
});

it.each([undefined, null, {}, { read: 1 }])(
  "rejects a missing reader: %s",
  (value) => {
    expect(() => resource(value as unknown as ResourceDefinition)).toThrow(
      "read function",
    );
  },
);

it.each([null, 1, {}, { ...definition() }])(
  "rejects unbranded registrations: %s",
  (value) => {
    expect(() => setup([value as Resource])).toThrow(
      "must be created with resource()",
    );
  },
);

it.each([
  { uri: "relative" },
  { uri: "/guide" },
  { uri: "docs://a b" },
  { uri: "docs://a%zz" },
  { uri: "docs://a\\b" },
  { uri: "https://[invalid" },
  { uri: "docs://host/a[1]" },
  { uri: "docs://host?q=[]" },
  { uri: "docs://host#one#two" },
  { uri: "docs://user@@host" },
  { uri: "docs://host:port" },
  { uri: "docs://[invalid]/" },
  { uri: "docs://[v1.%40]/" },
  { name: "" },
  { size: -1 },
  { size: 1.5 },
  { annotations: { priority: 2 } },
  { icons: [{ src: 1 }] },
  { _meta: { secret: new Date() } },
])("rejects invalid resource metadata: %j", (fields) => {
  const input = { uri, name: "guide", read: () => payload, ...fields };
  expect(() => setup([resource(input as ResourceDefinition)])).toThrow();
});

it.each([
  "docs://guide",
  "ui://widget/index.html",
  "urn:example:guide",
  "file:///guide.txt",
  "data:text/plain,Hello%20world",
  "https://user:pass@example.com:443/a?b=c#d",
  "docs://[2001:db8::1]/a",
  "docs://[v1.example:address]/a",
  "docs:",
])("supports absolute resource URI %s without normalization", async (uri) => {
  const server = setup([
    resource({
      uri,
      name: "guide",
      read: (uri) => ({ contents: [{ uri, text: "Guide" }] }),
    }),
  ]);
  expect(
    await server.handle(request(PROTOCOL_VERSION, "resources/read", { uri })),
  ).toMatchObject({ result: { contents: [{ uri, text: "Guide" }] } });
  await server.close();
});

it("rejects duplicate URIs and validates readers from compatible definitions", () => {
  expect(() => setup([definition(), definition()])).toThrow(
    "Duplicate resource URI",
  );
  const invalid = Object.create(definition(), { read: { value: 1 } });
  expect(() => setup([invalid])).toThrow("read function");
});

it("registers resources created by another package copy", async () => {
  vi.resetModules();
  const copy = await import("../src/index.js");
  expect(copy.resource).not.toBe(resource);
  const server = setup([
    copy.resource({ uri, name: "guide", read: () => payload }),
  ]);
  expect(
    await server.handle(request(PROTOCOL_VERSION, "resources/read", { uri })),
  ).toMatchObject({ result: payload });
  await server.close();
});

describe.each(versions)("resources over %s", (version) => {
  const handle = (
    server: ReturnType<typeof createServer>,
    method: string,
    params?: Record<string, unknown>,
  ) =>
    server.handle(request(version, method, params), {
      protocolVersion: version,
    });

  it("advertises an explicitly empty service and lists empty resources/templates", async () => {
    const server = setup([]);
    const discovered =
      version === PROTOCOL_VERSION
        ? await handle(server, "server/discover")
        : await handle(server, "initialize", {
            protocolVersion: version,
            capabilities: {},
            clientInfo: { name: "test", version: "1" },
          });
    expect(discovered).toMatchObject({
      result: { capabilities: { tools: {}, resources: {} } },
    });
    for (const [method, field] of [
      ["resources/list", "resources"],
      ["resources/templates/list", "resourceTemplates"],
    ]) {
      expect(await handle(server, method as string)).toMatchObject({
        result: { [field as string]: [] },
      });
    }
    await server.close();
  });

  it("leaves resources disabled when registrations are omitted", async () => {
    const server = createServer({ name: "tools", version: "1", tools: {} });
    for (const method of [
      "resources/list",
      "resources/templates/list",
      "resources/read",
      "resources/subscribe",
    ]) {
      expect(await handle(server, method, { uri })).toMatchObject({
        error: { code: -32601 },
      });
    }
    await server.close();
  });

  it("snapshots listing metadata, preserves order, and defers readers", async () => {
    const meta = {
      ui: {
        csp: { connectDomains: ["https://example.com"] },
        permissions: { camera: {} },
      },
    };
    const read = vi.fn(() => payload);
    const first = resource({
      uri,
      name: "guide",
      title: "Guide",
      description: "Help",
      mimeType: "text/plain",
      size: 5,
      annotations: {
        audience: ["user"],
        priority: 1,
        lastModified: "2026-11-06T00:00:00Z",
      },
      icons: [{ src: "icon.png", sizes: ["48x48"] }],
      _meta: meta,
      read,
    });
    const registrations = [
      first,
      resource({ ...definition(), uri: "urn:example:second" }),
    ];
    const server = setup(registrations);
    meta.ui.csp.connectDomains.push("https://changed.example");
    registrations.pop();
    const response = await handle(server, "resources/list");
    expect(response).toMatchObject({
      result: {
        resources: [
          {
            uri,
            name: "guide",
            title: "Guide",
            size: 5,
            annotations: { priority: 1 },
            _meta: { ui: { csp: { connectDomains: ["https://example.com"] } } },
          },
          { uri: "urn:example:second" },
        ],
      },
    });
    if (!response || !("result" in response))
      throw new Error("Expected result");
    const resources = response.result.resources as ProtocolResource[];
    expect(Object.hasOwn(resources[0] ?? {}, "icons")).toBe(
      version === PROTOCOL_VERSION,
    );
    resources[0]?.icons?.push({ src: "changed" });
    resources.splice(0);
    expect(await handle(server, "resources/list")).toMatchObject({
      result: { resources: [{ uri }, { uri: "urn:example:second" }] },
    });
    expect(read).not.toHaveBeenCalled();
    await server.close();
  });

  it("returns copied text, binary, and multiple contents with metadata", async () => {
    const value = {
      contents: [
        {
          uri: "ui://guide.html",
          mimeType: "text/html;profile=mcp-app",
          text: "<!doctype html><html></html>",
          _meta: {
            ui: {
              csp: { resourceDomains: ["https://example.com"] },
              permissions: { clipboardWrite: {} },
            },
          },
        },
        {
          uri: "file:///image.bin",
          blob: "aGVsbG8=",
          mimeType: "application/octet-stream",
        },
      ],
      _meta: { "example.com/value": [1] },
    };
    const server = setup([resource({ uri, name: "guide", read: () => value })]);
    const response = await handle(server, "resources/read", { uri });
    expect(response).toMatchObject({ result: value });
    expect(response).toMatchObject({
      result:
        version === PROTOCOL_VERSION
          ? { resultType: "complete", ttlMs: 0, cacheScope: "private" }
          : { contents: value.contents },
    });
    if (version === LEGACY_PROTOCOL_VERSION)
      expect(response).not.toHaveProperty("result.resultType");
    if (value.contents[0]?.text) value.contents[0].text = "Changed";
    value._meta["example.com/value"].push(2);
    expect(response).toMatchObject({
      result: {
        contents: [
          { text: "<!doctype html><html></html>" },
          { blob: "aGVsbG8=" },
        ],
        _meta: { "example.com/value": [1] },
      },
    });
    await server.close();
  });

  it("permits existing resources with empty contents and rejects unregistered exact URIs", async () => {
    const read = vi.fn(() => ({ contents: [] }));
    const server = setup([resource({ uri, name: "guide", read })]);
    expect(await handle(server, "resources/read", { uri })).toMatchObject({
      result: { contents: [] },
    });
    for (const unknown of [
      "docs://GUIDE",
      "file:///guide/../secret",
      "docs://guide?x=1",
    ]) {
      expect(
        await handle(server, "resources/read", { uri: unknown }),
      ).toMatchObject({
        error: {
          code: version === PROTOCOL_VERSION ? -32602 : -32002,
          message: "Resource not found",
          data: { uri: unknown },
        },
      });
    }
    expect(read).toHaveBeenCalledTimes(1);
    await server.close();
  });

  it.each([
    ["resources/list", { cursor: "next" }],
    ["resources/list", { cursor: "" }],
    ["resources/templates/list", { cursor: 1 }],
    ["resources/templates/list", { cursor: "next" }],
    ["resources/read", {}],
    ["resources/read", { uri: 1 }],
    ["resources/read", { uri: "/relative" }],
    ["resources/read", { uri, _meta: [] }],
  ])("rejects invalid parameters for %s: %j", async (method, params) => {
    const read = vi.fn(() => payload);
    const server = setup([resource({ uri, name: "guide", read })]);
    expect(await handle(server, method, params)).toMatchObject({
      error: { code: -32602 },
    });
    expect(read).not.toHaveBeenCalled();
    await server.close();
  });

  it.each([
    { contents: [{ uri }] },
    { contents: [{ uri, text: "a", blob: "YQ==" }] },
    { contents: [{ uri, blob: "not base64" }] },
    { contents: [{ uri: "/bad", text: "a" }] },
    { contents: [undefined] },
    { contents: [], extra: true },
    { contents: [], _meta: { bad: new Date() } },
  ])("keeps invalid reader output private: %j", async (value) => {
    const onError = vi.fn();
    const raw = resource({
      uri,
      name: "guide",
      read: () => value as ResourceReadResult,
    });
    expect(raw.read(uri, toolContext())).toBe(value);
    const server = createServer({
      name: "bad",
      version: "1",
      tools: {},
      resources: [raw],
      onError,
    });
    expect(await handle(server, "resources/read", { uri })).toMatchObject({
      error: { code: -32603, message: "Internal error" },
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]).toHaveLength(1);
    await server.close();
  });

  it.each([false, true])(
    "isolates reader and diagnostic failures (async diagnostics: %s)",
    async (asyncDiagnostic) => {
      const failure = new ProtocolError(
        -32099,
        "Private file path and credentials",
      );
      const onError = vi.fn(
        asyncDiagnostic
          ? async () => {
              throw Error("diagnostic");
            }
          : () => {
              throw Error("diagnostic");
            },
      );
      const server = createServer({
        name: "bad",
        version: "1",
        tools: {},
        resources: [
          resource({
            uri,
            name: "guide",
            read: () => {
              throw failure;
            },
          }),
        ],
        onError,
      });
      expect(await handle(server, "resources/read", { uri })).toMatchObject({
        error: { code: -32603, message: "Internal error" },
      });
      expect(onError.mock.calls).toEqual([[failure]]);
      await server.close();
    },
  );

  it("shares verified identities and per-read lazy provider caches", async () => {
    const type = Symbol("resource/auth");
    const useAuth = createAuthAccessor<{ subject: string; roles: string[] }>(
      type,
    );
    const source = { subject: "reader", roles: ["read"] };
    const resolve = vi.fn((ctx: ToolContext) => ({
      subject: useAuth(ctx).subject,
    }));
    const provider = createContext({ name: "data", resolve });
    const unusedResolve = vi.fn();
    const unused = createContext({ name: "unused", resolve: unusedResolve });
    const contexts: ToolContext[] = [];
    const server = createServer({
      name: "auth",
      version: "1",
      tools: {},
      context: [provider, unused],
      auth: {
        type,
        authorizationServers: ["https://auth.example.com"],
        verify: async (token) => {
          if (token !== "good") throw new AuthError("invalid_token");
          return source;
        },
      },
      resources: [
        resource({
          uri,
          name: "guide",
          async read(requested, ctx) {
            contexts.push(ctx);
            const a = await provider.use(ctx);
            expect(await provider.use(ctx)).toBe(a);
            expect(Object.isFrozen(useAuth(ctx).roles)).toBe(true);
            return { contents: [{ uri: requested, text: a.subject }] };
          },
        }),
      ],
    });
    await expect(
      handle(server, "resources/read", { uri }),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      server.authorize("bad", { resource: "https://api.example.com/mcp" }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(resolve).not.toHaveBeenCalled();
    for (let i = 0; i < 2; i++) {
      const scope = await server.authorize("good", {
        resource: "https://api.example.com/mcp",
      });
      try {
        expect(
          await server.handle(request(version, "resources/read", { uri }), {
            protocolVersion: version,
            auth: scope,
          }),
        ).toMatchObject({ result: { contents: [{ text: "reader" }] } });
      } finally {
        scope.dispose();
      }
    }
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(unusedResolve).not.toHaveBeenCalled();
    expect(contexts[0]?.request.protocolVersion).toBe(version);
    expect(Object.isFrozen(contexts[0]?.request.meta)).toBe(true);
    expect(contexts[0]?.request.client).toEqual(
      version === PROTOCOL_VERSION ? { capabilities: {} } : undefined,
    );
    await server.close();
  });

  it("keeps provider failures private", async () => {
    const failure = new Error("private service connection");
    const provider = createContext({
      name: "data",
      resolve: () => {
        throw failure;
      },
    });
    const onError = vi.fn();
    const server = createServer({
      name: "failure",
      version: "1",
      tools: {},
      context: [provider],
      onError,
      resources: [
        resource({
          uri,
          name: "guide",
          async read(_uri, ctx) {
            await provider.use(ctx);
            return payload;
          },
        }),
      ],
    });
    expect(await handle(server, "resources/read", { uri })).toMatchObject({
      error: { code: -32603 },
    });
    expect(onError.mock.calls).toEqual([[failure]]);
    await server.close();
  });

  it.each(["abort", "close", "reject"])(
    "suppresses late read results and failures after %s",
    async (action) => {
      const pending = deferred<ResourceReadResult>();
      const started = deferred<ToolContext>();
      const onError = vi.fn();
      const server = createServer({
        name: "cancel",
        version: "1",
        tools: {},
        onError,
        resources: [
          resource({
            uri,
            name: "guide",
            read(_uri, ctx) {
              started.resolve(ctx);
              return pending.promise;
            },
          }),
        ],
      });
      const controller = new AbortController();
      const reading = server.handle(
        request(version, "resources/read", { uri }),
        { protocolVersion: version, signal: controller.signal },
      );
      const ctx = await started.promise;
      if (action === "close") await server.close();
      else controller.abort("reader cancelled");
      expect(ctx.signal.aborted).toBe(true);
      if (action !== "close")
        expect(ctx.signal.reason).toBe("reader cancelled");
      if (action === "reject")
        pending.reject(new Error("private late failure"));
      else pending.resolve(payload);
      expect(await reading).toBeUndefined();
      expect(onError).not.toHaveBeenCalled();
      await server.close();
    },
  );
});

it("retains legacy connection client metadata for resource readers", async () => {
  const clientInfo = { name: "legacy", version: "1" };
  const read = vi.fn((_uri: string, ctx: ToolContext) => {
    expect(ctx.request.client).toEqual({ info: clientInfo, capabilities: {} });
    return payload;
  });
  const server = setup([resource({ uri, name: "guide", read })]);
  const transport = new MemoryTransport();
  await server.listen(transport);
  transport.receive(
    request(LEGACY_PROTOCOL_VERSION, "initialize", {
      protocolVersion: LEGACY_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo,
    }),
  );
  await vi.waitFor(() => expect(transport.messages).toHaveLength(1));
  transport.receive({ jsonrpc: "2.0", method: "notifications/initialized" });
  transport.receive(
    request(LEGACY_PROTOCOL_VERSION, "resources/read", { uri }),
  );
  await vi.waitFor(() => expect(transport.messages).toHaveLength(2));
  expect(read).toHaveBeenCalledTimes(1);
  await server.close();
});
