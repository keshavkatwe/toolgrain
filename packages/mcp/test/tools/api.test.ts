import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  createServer,
  mcpResult,
  type Server,
  type ToolDefinition,
  ToolNameError,
  ToolSchemaError,
  tool,
  toolContext,
} from "../../src/index.js";
import { createRegistry } from "../../src/tools/registry.js";
import { deferred } from "../memory.js";

function invoke(
  server: Server,
  revision: SupportedProtocolVersion,
  method: string,
  params: Record<string, unknown> = {},
  signal?: AbortSignal,
) {
  return server.handle(
    {
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        ...(revision === PROTOCOL_VERSION
          ? {
              _meta: {
                "io.modelcontextprotocol/protocolVersion": revision,
                "io.modelcontextprotocol/clientCapabilities": {},
              },
            }
          : {}),
      },
    },
    { protocolVersion: revision, ...(signal ? { signal } : {}) },
  );
}

describe.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "tool API (%s)",
  (revision) => {
    it("snapshots direct metadata and exposes compatible output schemas", async () => {
      const annotations = {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      };
      const icons = [
        {
          src: "https://example.com/tool.png",
          mimeType: "image/png",
          sizes: ["48x48"],
          theme: "light" as const,
        },
      ];
      const meta = { "example/key": { value: 1 } };
      const server = createServer({
        name: "test",
        version: "1",
        tools: {
          greet: tool({
            title: "Greeting",
            description: "Say hello",
            annotations,
            icons,
            _meta: meta,
            input: z.object({ name: z.string().default("Ada") }),
            output: z.object({ message: z.string() }),
            execute: ({ name }) => ({ message: `Hello, ${name}!` }),
          }),
          array: tool({
            input: z.object({}),
            output: z.array(z.number()),
            execute: () => [1, 2],
          }),
        },
      });
      annotations.readOnlyHint = false;
      const firstIcon = icons[0];
      if (!firstIcon) throw new Error("Expected icon");
      firstIcon.src = "changed";
      meta["example/key"].value = 2;
      const listed = await invoke(server, revision, "tools/list");
      expect(listed).toMatchObject({
        result: {
          tools: [
            {
              name: "greet",
              title: "Greeting",
              description: "Say hello",
              annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
              },
              _meta: { "example/key": { value: 1 } },
              outputSchema: {
                type: "object",
                properties: { message: { type: "string" } },
              },
            },
            { name: "array" },
          ],
        },
      });
      if (revision === PROTOCOL_VERSION)
        expect(listed).toHaveProperty("result.tools.0.icons", [
          {
            src: "https://example.com/tool.png",
            mimeType: "image/png",
            sizes: ["48x48"],
            theme: "light",
          },
        ]);
      else expect(listed).not.toHaveProperty("result.tools.0.icons");
      if (revision === PROTOCOL_VERSION)
        expect(listed).toHaveProperty(
          "result.tools.1.outputSchema.type",
          "array",
        );
      else expect(listed).not.toHaveProperty("result.tools.1.outputSchema");
      const definitions = server.getToolDefinitions();
      const first = definitions[0];
      if (!first?.annotations) throw new Error("Expected annotations");
      first.annotations.readOnlyHint = false;
      expect(server.getToolDefinitions()[0]?.annotations?.readOnlyHint).toBe(
        true,
      );
      expect(
        await invoke(server, revision, "tools/call", { name: "greet" }),
      ).toMatchObject({
        result: {
          structuredContent: { message: "Hello, Ada!" },
          content: [{ type: "text", text: '{"message":"Hello, Ada!"}' }],
        },
      });
    });

    it("validates outputs asynchronously and returns parsed defaults and transforms", async () => {
      const server = createServer({
        name: "test",
        version: "1",
        tools: {
          parsed: tool({
            input: z.object({}),
            output: z
              .object({
                count: z
                  .string()
                  .default("2")
                  .transform(Number)
                  .pipe(z.number().positive()),
              })
              .refine(async ({ count }) => count < 10),
            execute: async () => ({}),
          }),
          invalid: tool({
            input: z.object({}),
            output: z.object({ count: z.number().positive() }),
            execute: () => ({ count: -1 }),
          }),
        },
      });
      expect(server.getToolDefinitions()[0]?.outputSchema).toMatchObject({
        properties: { count: { type: "number" } },
        required: ["count"],
      });
      expect(
        await invoke(server, revision, "tools/call", { name: "parsed" }),
      ).toMatchObject({ result: { structuredContent: { count: 2 } } });
      expect(
        await invoke(server, revision, "tools/call", { name: "invalid" }),
      ).toMatchObject({
        result: {
          isError: true,
          content: [{ text: "Tool execution failed" }],
        },
      });
    });

    it("handles strings, arrays, scalars, null and unrestricted JSON output schemas", async () => {
      for (const [output, value] of [
        [z.string(), "hello"],
        [z.array(z.number()), [1, 2]],
        [z.number(), 2],
        [z.boolean(), false],
        [z.null(), null],
        [z.unknown(), { ok: true }],
      ] as const) {
        const server = createServer({
          name: "test",
          version: "1",
          tools: {
            value: tool({ input: z.object({}), output, execute: () => value }),
          },
        });
        const response = await invoke(server, revision, "tools/call", {
          name: "value",
        });
        expect(response).toHaveProperty("result.content", [
          { type: "text", text: JSON.stringify(value) },
        ]);
        if (
          revision === PROTOCOL_VERSION ||
          (typeof value === "object" && value !== null && !Array.isArray(value))
        )
          expect(response).toHaveProperty("result.structuredContent", value);
        else expect(response).not.toHaveProperty("result.structuredContent");
      }
    });

    it("supports explicit mixed content and validates its structured data", async () => {
      const server = createServer({
        name: "test",
        version: "1",
        tools: {
          rich: tool({
            input: z.object({}),
            output: z.object({ count: z.number().default(1) }),
            execute: () =>
              mcpResult({
                content: [
                  {
                    type: "text",
                    text: "Summary",
                    annotations: {
                      audience: ["user"],
                      priority: 0.5,
                      lastModified: "2026-10-18T00:00:00Z",
                    },
                  },
                  { type: "image", data: "AA==", mimeType: "image/png" },
                  { type: "audio", data: "AA==", mimeType: "audio/wav" },
                  {
                    type: "resource_link",
                    uri: "https://example.com/report",
                    name: "Report",
                    icons: [{ src: "https://example.com/icon.png" }],
                  },
                  {
                    type: "resource",
                    resource: {
                      uri: "file:///report.txt",
                      text: "Report",
                      mimeType: "text/plain",
                    },
                  },
                  {
                    type: "resource",
                    resource: {
                      uri: "file:///image.png",
                      blob: "AA==",
                      mimeType: "image/png",
                    },
                  },
                ],
                structuredContent: {},
                _meta: { "example/result": true },
              }),
          }),
        },
      });
      const response = await invoke(server, revision, "tools/call", {
        name: "rich",
      });
      expect(response).toHaveProperty("result.structuredContent", { count: 1 });
      expect(response).toHaveProperty("result.content.0.text", "Summary");
      expect(response).toHaveProperty("result.content.6", {
        type: "text",
        text: '{"count":1}',
      });
      expect(response).toHaveProperty("result._meta.example/result", true);
      if (revision === PROTOCOL_VERSION)
        expect(response).toHaveProperty("result.content.3.icons");
      else expect(response).not.toHaveProperty("result.content.3.icons");
    });

    it("keeps ordinary result-shaped objects as data and allows explicit tool errors", async () => {
      const plain = {
        content: [{ type: "text", text: "application data" }],
        isError: true,
      };
      const server = createServer({
        name: "test",
        version: "1",
        tools: {
          plain: tool({ input: z.object({}), execute: () => plain }),
          error: tool({
            input: z.object({}),
            output: z.object({ required: z.string() }),
            execute: () =>
              mcpResult({
                isError: true,
                content: [{ type: "text", text: "Try again" }],
              }),
          }),
          rich: tool({
            input: z.object({}),
            execute: () =>
              mcpResult({ content: [], structuredContent: { ok: true } }),
          }),
          deduplicated: tool({
            input: z.object({}),
            execute: () =>
              mcpResult({
                content: [{ type: "text", text: "null" }],
                structuredContent: null,
              }),
          }),
        },
      });
      const response = await invoke(server, revision, "tools/call", {
        name: "plain",
      });
      expect(response).toHaveProperty("result.structuredContent", plain);
      expect(response).not.toHaveProperty("result.isError");
      expect(
        await invoke(server, revision, "tools/call", { name: "error" }),
      ).toMatchObject({
        result: {
          isError: true,
          content: [{ type: "text", text: "Try again" }],
        },
      });
      expect(
        await invoke(server, revision, "tools/call", { name: "error" }),
      ).not.toHaveProperty("result.structuredContent");
      expect(
        await invoke(server, revision, "tools/call", { name: "rich" }),
      ).toHaveProperty("result.content", [
        { type: "text", text: '{"ok":true}' },
      ]);
      expect(
        await invoke(server, revision, "tools/call", { name: "deduplicated" }),
      ).toHaveProperty("result.content", [{ type: "text", text: "null" }]);
    });

    it("validates and parses structured error data while preserving text-only errors", async () => {
      const server = createServer({
        name: "test",
        version: "1",
        tools: {
          parsedError: tool({
            input: z.object({}),
            output: z
              .object({
                count: z
                  .string()
                  .default("2")
                  .transform(Number)
                  .pipe(z.number().positive()),
              })
              .refine(async ({ count }) => count < 10),
            execute: () =>
              mcpResult({
                isError: true,
                content: [{ type: "text", text: "Partial failure" }],
                structuredContent: {},
                _meta: { "example/error": true },
              }),
          }),
          invalidError: tool({
            input: z.object({}),
            output: z.object({ count: z.number().positive() }),
            execute: () =>
              mcpResult({
                isError: true,
                content: [{ type: "text", text: "Unvalidated error" }],
                structuredContent: { count: -1 },
              }),
          }),
          textOnlyError: tool({
            input: z.object({}),
            output: z.object({ count: z.number().default(2) }),
            execute: () =>
              mcpResult({
                isError: true,
                content: [{ type: "text", text: "Unavailable" }],
              }),
          }),
          untypedError: tool({
            input: z.object({}),
            execute: () =>
              mcpResult({
                isError: true,
                content: [],
                structuredContent: { reason: "Unavailable" },
              }),
          }),
          untypedTextError: tool({
            input: z.object({}),
            execute: () =>
              mcpResult({
                isError: true,
                content: [{ type: "text", text: "Unavailable" }],
              }),
          }),
        },
      });
      expect(
        await invoke(server, revision, "tools/call", { name: "parsedError" }),
      ).toMatchObject({
        result: {
          isError: true,
          structuredContent: { count: 2 },
          content: [
            { type: "text", text: "Partial failure" },
            { type: "text", text: '{"count":2}' },
          ],
          _meta: { "example/error": true },
        },
      });
      const invalid = await invoke(server, revision, "tools/call", {
        name: "invalidError",
      });
      expect(invalid).toMatchObject({
        result: {
          isError: true,
          content: [{ type: "text", text: "Tool execution failed" }],
        },
      });
      expect(invalid).not.toHaveProperty("result.structuredContent");
      const textOnly = await invoke(server, revision, "tools/call", {
        name: "textOnlyError",
      });
      expect(textOnly).toMatchObject({
        result: {
          isError: true,
          content: [{ type: "text", text: "Unavailable" }],
        },
      });
      expect(textOnly).not.toHaveProperty("result.structuredContent");
      expect(
        await invoke(server, revision, "tools/call", { name: "untypedError" }),
      ).toMatchObject({
        result: {
          isError: true,
          structuredContent: { reason: "Unavailable" },
        },
      });
      const untypedText = await invoke(server, revision, "tools/call", {
        name: "untypedTextError",
      });
      expect(untypedText).toMatchObject({
        result: {
          isError: true,
          content: [{ type: "text", text: "Unavailable" }],
        },
      });
      expect(untypedText).not.toHaveProperty("result.structuredContent");
    });

    it("validates present falsy error data before revision-specific conversion", async () => {
      for (const [output, value] of [
        [z.number(), 0],
        [z.boolean(), false],
        [z.null(), null],
      ] as const) {
        const invalidOutput: z.ZodType = output;
        const server = createServer({
          name: "test",
          version: "1",
          tools: {
            valid: tool({
              input: z.object({}),
              output,
              execute: () =>
                mcpResult({
                  content: [],
                  isError: true,
                  structuredContent: value,
                }),
            }),
            invalid: tool({
              input: z.object({}),
              output: invalidOutput.refine(async () => false),
              execute: () =>
                mcpResult({
                  content: [],
                  isError: true,
                  structuredContent: value,
                }),
            }),
          },
        });
        const valid = await invoke(server, revision, "tools/call", {
          name: "valid",
        });
        expect(valid).toMatchObject({
          result: {
            isError: true,
            content: [{ type: "text", text: JSON.stringify(value) }],
          },
        });
        if (revision === PROTOCOL_VERSION)
          expect(valid).toHaveProperty("result.structuredContent", value);
        else expect(valid).not.toHaveProperty("result.structuredContent");
        const invalid = await invoke(server, revision, "tools/call", {
          name: "invalid",
        });
        expect(invalid).toHaveProperty("result.content", [
          { type: "text", text: "Tool execution failed" },
        ]);
        expect(invalid).not.toHaveProperty("result.structuredContent");
      }
    });

    it("rejects malformed explicit content and missing or invalid structured output", async () => {
      const server = createServer({
        name: "test",
        version: "1",
        tools: {
          invalid: tool({
            input: z.object({}),
            output: z.object({ count: z.number().positive() }),
            execute: () =>
              mcpResult({ content: [], structuredContent: { count: -1 } }),
          }),
          missing: tool({
            input: z.object({}),
            output: z.object({}),
            execute: () => mcpResult({ content: [] }),
          }),
          malformed: tool({
            input: z.object({}),
            execute: () =>
              mcpResult({
                content: [
                  // @ts-expect-error Runtime checks also protect JavaScript handlers.
                  { type: "image", data: 2 },
                ],
              }),
          }),
          unsupported: tool({
            input: z.object({}),
            output: z.unknown(),
            execute: () => undefined,
          }),
        },
      });
      for (const name of ["invalid", "missing", "malformed", "unsupported"])
        expect(
          await invoke(server, revision, "tools/call", { name }),
        ).toHaveProperty("result.isError", true);
    });

    it("suppresses output-validation responses after cancellation", async () => {
      const started = deferred();
      const finished = deferred<boolean>();
      const server = createServer({
        name: "test",
        version: "1",
        tools: {
          slow: tool({
            input: z.object({}),
            output: z.object({}).refine(() => {
              started.resolve();
              return finished.promise;
            }),
            execute: () => ({}),
          }),
        },
      });
      const controller = new AbortController();
      const response = invoke(
        server,
        revision,
        "tools/call",
        { name: "slow" },
        controller.signal,
      );
      await started.promise;
      controller.abort();
      finished.resolve(true);
      expect(await response).toBeUndefined();
    });
    it("treats undefined optional envelope and output fields as absent", async () => {
      const server = createServer({
        name: "test",
        version: "1",
        tools: {
          envelope: tool({
            input: z.object({}),
            execute: () =>
              // JavaScript and non-exact optional types may pass undefined fields.
              mcpResult({
                content: [
                  { type: "text", text: "ok", _meta: undefined },
                  {
                    type: "resource_link",
                    uri: "file:///report.txt",
                    name: "report",
                    title: undefined,
                  },
                ],
                isError: undefined,
                structuredContent: undefined,
                _meta: undefined,
              } as never),
          }),
          optional: tool({
            input: z.object({}),
            output: z.object({
              message: z.string(),
              note: z.string().optional(),
            }),
            execute: () => ({ message: "hi", note: undefined }),
          }),
          data: tool({
            input: z.object({}),
            execute: () =>
              mcpResult({
                content: [],
                structuredContent: { value: undefined },
              } as never),
          }),
        },
      });
      expect(
        await invoke(server, revision, "tools/call", { name: "envelope" }),
      ).toHaveProperty("result.content", [
        { type: "text", text: "ok" },
        { type: "resource_link", uri: "file:///report.txt", name: "report" },
      ]);
      const envelope = await invoke(server, revision, "tools/call", {
        name: "envelope",
      });
      expect(envelope).not.toHaveProperty("result.isError");
      expect(envelope).not.toHaveProperty("result.structuredContent");
      expect(
        await invoke(server, revision, "tools/call", { name: "optional" }),
      ).toMatchObject({
        result: {
          content: [{ type: "text", text: '{"message":"hi"}' }],
          structuredContent: { message: "hi" },
        },
      });
      // Undefined values inside structured content remain application data errors.
      expect(
        await invoke(server, revision, "tools/call", { name: "data" }),
      ).toMatchObject({
        result: {
          isError: true,
          content: [{ text: "Tool execution failed" }],
        },
      });
    });

    it("replaces raw structured text with the parsed serialization", async () => {
      const server = createServer({
        name: "test",
        version: "1",
        tools: {
          parsed: tool({
            input: z.object({}),
            output: z.object({
              count: z.string().transform(Number).pipe(z.number()),
            }),
            execute: () =>
              mcpResult({
                content: [
                  { type: "text", text: "Summary" },
                  {
                    type: "text",
                    text: JSON.stringify({ count: "2" }),
                    annotations: { audience: ["assistant"] },
                  },
                ],
                structuredContent: { count: "2" },
              }),
          }),
        },
      });
      expect(
        await invoke(server, revision, "tools/call", { name: "parsed" }),
      ).toMatchObject({
        result: {
          content: [
            { type: "text", text: "Summary" },
            {
              type: "text",
              text: '{"count":2}',
              annotations: { audience: ["assistant"] },
            },
          ],
          structuredContent: { count: 2 },
        },
      });
    });
  },
);

it("requires schema-checked tools and rejects modified object spreads", () => {
  const definition = tool({ input: z.string(), execute: (value) => value });
  const raw = {
    input: z.string(),
    execute: (value: number) => value.toFixed(),
  };
  expect(() =>
    // @ts-expect-error Raw definitions bypass schema/handler checking.
    createServer({ name: "test", version: "1", tools: { raw } }),
  ).toThrow("must be created with tool()");
  expect(() =>
    // @ts-expect-error Spreads must pass through tool() again to check their types.
    createRegistry({ changed: { ...definition, input: z.number() } }),
  ).toThrow("must be created with tool()");
  expect(Object.isFrozen(definition)).toBe(true);
  const positive = tool({
    input: z.number().positive(),
    execute: (value) => value,
  });
  expect(positive.execute(-1, toolContext())).toBe(-1);
  const options: ToolDefinition<z.ZodString, string> = {
    input: z.string(),
    execute: (value) => value,
  };
  expect(tool(options).execute("typed", toolContext())).toBe("typed");
  const extraOptions = {
    input: z.object({}),
    execute: () => null,
    name: "override",
    privateData: "hidden",
  };
  const definitions = createServer({
    name: "test",
    version: "1",
    tools: { original: tool(extraOptions) },
  }).getToolDefinitions();
  expect(definitions[0]).toMatchObject({ name: "original" });
  expect(definitions[0]).not.toHaveProperty("privateData");
});

it("checks handler output types against the optional output schema", () => {
  const definition = tool({
    input: z.object({}),
    output: z.object({ count: z.number() }),
    execute: () => ({ count: 1 }),
  });
  expectTypeOf(definition.execute({}, toolContext())).toEqualTypeOf<{
    count: number;
  }>();
  // @ts-expect-error The handler must return data accepted by the output schema.
  tool({ input: z.object({}), output: z.number(), execute: () => "wrong" });
  tool({
    input: z.object({}),
    // @ts-expect-error Explicit structured data must also match the output schema.
    output: z.number(),
    execute: () => mcpResult({ content: [], structuredContent: "wrong" }),
  });
  tool({
    input: z.object({}),
    // @ts-expect-error Error structured data must also match the output schema.
    output: z.number(),
    execute: () =>
      mcpResult({ content: [], isError: true, structuredContent: "wrong" }),
  });

  const jsonResult = tool({
    input: z.object({}),
    execute: () => ({ count: 1 }),
  });
  expectTypeOf(jsonResult.execute({}, toolContext())).toEqualTypeOf<{
    count: number;
  }>();
  interface NamedResult {
    count: number;
  }
  const namedResult = tool({
    input: z.object({}),
    execute: (): NamedResult => ({ count: 1 }),
  });
  expectTypeOf(
    namedResult.execute({}, toolContext()),
  ).toEqualTypeOf<NamedResult>();
  mcpResult({ content: [], structuredContent: { count: 1 } as NamedResult });
  tool({ input: z.object({}), execute: () => "plain text" });
  tool({
    input: z.object({}),
    execute: () => mcpResult({ content: [], isError: true }),
  });
  // @ts-expect-error Without an output schema, ordinary results must be JSON values.
  tool({ input: z.object({}), execute: () => new Date() });
  // @ts-expect-error Async handlers must also return JSON-compatible results.
  tool({ input: z.object({}), execute: async () => new Date() });
  // @ts-expect-error Explicit structured content must be JSON-compatible.
  mcpResult({ content: [], structuredContent: new Date() });
  // @ts-expect-error Error structured content must be JSON-compatible too.
  mcpResult({ content: [], isError: true, structuredContent: new Date() });
});

it("checks exposed names and fails unrepresentable schemas and invalid metadata early", () => {
  const definition = tool({ input: z.object({}), execute: () => null });
  for (const name of [
    "",
    "bad name",
    "a,b",
    "a/b",
    "é",
    "x\n",
    "a".repeat(129),
  ])
    expect(() =>
      createServer({
        name: "test",
        version: "1",
        tools: { [name]: definition },
      }),
    ).toThrow(ToolNameError);
  const names = ["a", "A", "admin.tools_v2-1", "a".repeat(128), "__proto__"];
  expect(
    createServer({
      name: "test",
      version: "1",
      tools: Object.fromEntries(names.map((name) => [name, definition])),
    })
      .getToolDefinitions()
      .map(({ name }) => name),
  ).toEqual(names);
  expect(new ToolNameError("bad")).toMatchObject({
    name: "ToolNameError",
    toolName: "bad",
  });
  expect(() =>
    createServer({
      name: "test",
      version: "1",
      tools: {
        date: tool({
          input: z.object({}),
          output: z.date(),
          execute: () => new Date(),
        }),
      },
    }),
  ).toThrow(ToolSchemaError);
  expect(() =>
    createServer({
      name: "test",
      version: "1",
      tools: {
        invalid: tool({
          input: z.object({}),
          annotations: {
            // @ts-expect-error Invalid JavaScript metadata fails at construction.
            readOnlyHint: "yes",
          },
          execute: () => null,
        }),
      },
    }),
  ).toThrow(ToolSchemaError);
});
