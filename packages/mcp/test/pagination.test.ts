import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createContext, createServer, resource, tool } from "../src/index.js";
import { MemoryTransport } from "./memory.js";

const versions = [PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const;
const icon = { src: "https://example.com/icon.png" };
const execute = vi.fn(() => [] as number[]);
const read = vi.fn((uri: string) => ({ contents: [{ uri, text: "Guide" }] }));
const provider = vi.fn(() => ({}));
const onError = vi.fn();
const definition = tool({
  input: z.object({}),
  output: z.array(z.number()),
  icons: [icon],
  _meta: { "example.com/list": { original: true } },
  execute,
});
const setup = (count = 5, listPageSize?: number) =>
  createServer({
    name: "pagination",
    version: "1",
    ...(listPageSize === undefined ? {} : { listPageSize }),
    onError,
    tools: Object.fromEntries(
      Array.from({ length: count }, (_, i) => [`tool${i}`, definition]),
    ),
    resources: Array.from({ length: count }, (_, i) =>
      resource({
        uri: `docs://guide${i}`,
        name: `guide${i}`,
        icons: [icon],
        read,
      }),
    ),
    context: [createContext({ name: "unused", resolve: provider })],
  });

function request(
  version: SupportedProtocolVersion,
  method: string,
  params: Record<string, unknown> = {},
) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method,
    params: {
      ...params,
      ...(version === PROTOCOL_VERSION
        ? {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": version,
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          }
        : {}),
    },
  };
}

describe.each(versions)("pagination in %s", (version) => {
  const handle = (
    server: ReturnType<typeof createServer>,
    method: string,
    params?: Record<string, unknown>,
  ) =>
    server.handle(request(version, method, params), {
      protocolVersion: version,
    });

  it.each([
    ["tools/list", "tools"],
    ["resources/list", "resources"],
  ])(
    "walks %s in stable registration order without invoking application code",
    async (method, field) => {
      const server = setup(5, 2);
      execute.mockClear();
      read.mockClear();
      provider.mockClear();
      try {
        const pages = [];
        let cursor: unknown;
        for (let page = 0; page < 3; page++) {
          const response = await handle(
            server,
            method,
            cursor ? { cursor } : {},
          );
          if (!response || !("result" in response))
            throw new Error("Expected page");
          const result = response.result;
          expect(result).toMatchObject(
            version === PROTOCOL_VERSION
              ? { resultType: "complete", ttlMs: 0, cacheScope: "private" }
              : {},
          );
          if (version === LEGACY_PROTOCOL_VERSION) {
            expect(result).not.toHaveProperty("resultType");
            expect(result).not.toHaveProperty("ttlMs");
            expect(result).not.toHaveProperty("_meta");
          }
          const items = result[field] as Record<string, unknown>[];
          expect(items).toHaveLength(page < 2 ? 2 : 1);
          for (const item of items) {
            expect(Object.hasOwn(item, "icons")).toBe(
              version === PROTOCOL_VERSION,
            );
            if (field === "tools")
              expect(Object.hasOwn(item, "outputSchema")).toBe(
                version === PROTOCOL_VERSION,
              );
          }
          pages.push(...items);
          cursor = result.nextCursor;
          if (page < 2) expect(cursor).toEqual(expect.any(String));
          else expect(result).not.toHaveProperty("nextCursor");
        }
        expect(pages.map((entry) => entry.name)).toEqual(
          Array.from(
            { length: 5 },
            (_, i) => `${field === "tools" ? "tool" : "guide"}${i}`,
          ),
        );
        expect(execute).not.toHaveBeenCalled();
        expect(read).not.toHaveBeenCalled();
        expect(provider).not.toHaveBeenCalled();
      } finally {
        await server.close();
      }
    },
  );

  it.each([0, 1, 2, 4])(
    "terminates empty and exact-boundary lists of %i entries",
    async (count) => {
      const server = setup(count, 2);
      try {
        for (const [method, field] of [
          ["tools/list", "tools"],
          ["resources/list", "resources"],
        ]) {
          const first = await handle(server, method as string);
          if (!first || !("result" in first)) throw new Error("Expected page");
          expect(first.result[field as string]).toHaveLength(
            Math.min(2, count),
          );
          const last =
            count > 2
              ? await handle(server, method as string, {
                  cursor: first.result.nextCursor,
                })
              : first;
          expect(last).toHaveProperty("result");
          expect(last && "result" in last && last.result).not.toHaveProperty(
            "nextCursor",
          );
        }
      } finally {
        await server.close();
      }
    },
  );

  it("rejects foreign, stale, malformed, and out-of-range cursors without diagnostics", async () => {
    const server = setup(5, 2);
    const other = setup(5, 2);
    onError.mockClear();
    try {
      const first = await handle(server, "tools/list");
      if (!first || !("result" in first)) throw new Error("Expected page");
      const cursor = first.result.nextCursor as string;
      for (const [target, method, value] of [
        [other, "tools/list", cursor],
        [server, "resources/list", cursor],
        [server, "resources/templates/list", cursor],
        ...[
          "next",
          "2",
          null,
          1,
          {},
          `${cursor}x`,
          cursor.replace(/2$/, "0"),
          cursor.replace(/2$/, "3"),
          cursor.replace(/2$/, "6"),
          cursor.replace(/2$/, "9007199254740992"),
        ].map((value) => [server, "tools/list", value] as const),
      ] as const) {
        expect(await handle(target, method, { cursor: value })).toMatchObject({
          error: { code: -32602 },
        });
      }
      expect(await handle(server, "resources/templates/list")).toMatchObject({
        result: { resourceTemplates: [] },
      });
      await server.close();
      expect(await handle(other, "tools/list", { cursor })).toMatchObject({
        error: { code: -32602 },
      });
      expect(onError).not.toHaveBeenCalled();
    } finally {
      await server.close();
      await other.close();
    }
  });

  it("replays cursors and isolates response mutations from the registration snapshot", async () => {
    const server = setup(5, 2);
    try {
      for (const [method, field] of [
        ["tools/list", "tools"],
        ["resources/list", "resources"],
      ]) {
        const first = await handle(server, method as string);
        if (!first || !("result" in first)) throw new Error("Expected page");
        const original = structuredClone(first);
        const item = (first.result[field as string] as { name: string }[]).at(
          0,
        );
        if (!item) throw new Error("Expected listing metadata");
        item.name = "changed";
        expect(await handle(server, method as string)).toEqual(original);
        const params = { cursor: original.result.nextCursor };
        const [left, right] = await Promise.all([
          handle(server, method as string, params),
          handle(server, method as string, params),
        ]);
        expect(left).toEqual(right);
      }
      const all = server.getToolDefinitions();
      expect(all).toHaveLength(5);
      const first = all.at(0);
      if (!first) throw new Error("Expected tool metadata");
      first.inputSchema.description = "changed";
      expect(server.getToolDefinitions()[0]?.inputSchema).not.toHaveProperty(
        "description",
      );
    } finally {
      await server.close();
    }
  });
});

it("defaults both list endpoints to 100 entries and supports a message transport", async () => {
  const server = setup(101);
  const transport = new MemoryTransport();
  await server.listen(transport);
  try {
    for (const [method, field] of [
      ["tools/list", "tools"],
      ["resources/list", "resources"],
    ]) {
      transport.receive(request(PROTOCOL_VERSION, method as string));
      await vi.waitFor(() => expect(transport.messages).toHaveLength(1));
      const first = transport.messages.pop();
      if (!first || !("result" in first)) throw new Error("Expected page");
      expect(first.result[field as string]).toHaveLength(100);
      const last = await server.handle(
        request(PROTOCOL_VERSION, method as string, {
          cursor: first.result.nextCursor,
        }),
      );
      expect(last).toMatchObject({
        result: {
          [field as string]: [
            expect.objectContaining({
              name: `${field === "tools" ? "tool" : "guide"}100`,
            }),
          ],
        },
      });
      expect(last && "result" in last && last.result).not.toHaveProperty(
        "nextCursor",
      );
    }
  } finally {
    await server.close();
  }
});

it.each([
  0,
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
  null,
  "2",
])("rejects invalid listPageSize %s at construction", (size) => {
  expect(() => setup(0, size as number)).toThrow(
    "listPageSize must be a positive safe integer",
  );
});

it("accepts the largest safe page size", async () => {
  const server = setup(1, Number.MAX_SAFE_INTEGER);
  expect(
    await server.handle(request(PROTOCOL_VERSION, "tools/list")),
  ).toMatchObject({ result: { tools: [{ name: "tool0" }] } });
  await server.close();
});
