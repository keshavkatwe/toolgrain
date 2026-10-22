import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type ProtocolResponse,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import * as mini from "zod/v4/mini";
import {
  createServer,
  mcpResult,
  type Server,
  type ToolContext,
  ToolSchemaError,
  tool,
  toolContext,
} from "../../src/index.js";
import { deferred } from "../memory.js";

const classicInput = z
  .object({ count: z.string().default("2").transform(Number) })
  .refine(async ({ count }) => count > 0, "Count must be positive");
const miniInput = mini
  .object({
    count: mini.pipe(mini._default(mini.string(), "2"), mini.transform(Number)),
  })
  .check(mini.refine(async ({ count }) => count > 0, "Count must be positive"));
const classicOutput = z
  .object({
    count: z.string().transform(Number).pipe(z.number()),
    label: z.string().default("ready"),
  })
  .refine(async ({ count }) => count < 10);
const miniOutput = mini
  .object({
    count: mini.pipe(
      mini.pipe(mini.string(), mini.transform(Number)),
      mini.number(),
    ),
    label: mini._default(mini.string(), "ready"),
  })
  .check(mini.refine(async ({ count }) => count < 10));

function call(
  server: Server,
  revision: SupportedProtocolVersion,
  name: string,
  input = {},
  signal?: AbortSignal,
) {
  return server.handle(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: input,
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
    { protocolVersion: revision, ...(signal === undefined ? {} : { signal }) },
  );
}

function expectStructuredResult(
  response: ProtocolResponse | undefined,
  value: unknown,
) {
  expect(response).toMatchObject({ result: { structuredContent: value } });
  if (!response || !("result" in response))
    throw new Error("Expected successful response");
  expect(response.result.content).toEqual([
    { type: "text", text: JSON.stringify(response.result.structuredContent) },
  ]);
}

describe.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "Zod interoperability (%s)",
  (revision) => {
    it.each([
      {
        label: "Classic input / Mini output",
        input: classicInput,
        output: miniOutput,
      },
      {
        label: "Mini input / Classic output",
        input: miniInput,
        output: classicOutput,
      },
      {
        label: "Mini input / Mini output",
        input: miniInput,
        output: miniOutput,
      },
    ])("validates, parses, and exposes $label", async ({ input, output }) => {
      const execute = vi.fn(({ count }: { count: number }) => ({
        count: String(count),
      }));
      const server = createServer({
        name: "test",
        version: "1",
        tools: { count: tool({ input, output, execute }) },
      });
      try {
        expect(server.getToolDefinitions()[0]).toMatchObject({
          inputSchema: {
            properties: { count: { type: "string", default: "2" } },
          },
          outputSchema: {
            properties: {
              count: { type: "number" },
              label: { type: "string", default: "ready" },
            },
            required: ["count", "label"],
          },
        });
        expectStructuredResult(await call(server, revision, "count"), {
          count: 2,
          label: "ready",
        });
        expect(execute).toHaveBeenCalledExactlyOnceWith(
          { count: 2 },
          expect.anything(),
        );
        expect(
          await call(server, revision, "count", { count: "-1" }),
        ).toMatchObject({
          result: {
            isError: true,
            content: [{ text: "input: Count must be positive" }],
          },
        });
        expect(execute).toHaveBeenCalledOnce();
        const invalidOutput = await call(server, revision, "count", {
          count: "12",
        });
        expect(invalidOutput).toMatchObject({
          result: {
            isError: true,
            content: [{ text: "Tool execution failed" }],
          },
        });
        expect(invalidOutput).not.toHaveProperty("result.structuredContent");
      } finally {
        await server.close();
      }
    });

    it("parses Mini structured results and preserves text-only errors", async () => {
      const server = createServer({
        name: "test",
        version: "1",
        tools: {
          rich: tool({
            input: mini.object({}),
            output: miniOutput,
            execute: () =>
              mcpResult({
                content: [{ type: "text", text: '{"count":"2"}' }],
                structuredContent: { count: "2" },
              }),
          }),
          structuredError: tool({
            input: mini.object({}),
            output: miniOutput,
            execute: () =>
              mcpResult({
                content: [],
                structuredContent: { count: "2" },
                isError: true,
              }),
          }),
          textError: tool({
            input: mini.object({}),
            output: mini.object({ count: mini._default(mini.number(), 2) }),
            execute: () =>
              mcpResult({
                content: [{ type: "text", text: "Unavailable" }],
                isError: true,
              }),
          }),
          invalid: tool({
            input: mini.object({}),
            output: miniOutput,
            execute: () =>
              mcpResult({ content: [], structuredContent: { count: "12" } }),
          }),
        },
      });
      try {
        expectStructuredResult(await call(server, revision, "rich"), {
          count: 2,
          label: "ready",
        });
        expect(await call(server, revision, "structuredError")).toMatchObject({
          result: {
            isError: true,
            structuredContent: { count: 2, label: "ready" },
          },
        });
        const error = await call(server, revision, "textError");
        expect(error).toMatchObject({
          result: { isError: true, content: [{ text: "Unavailable" }] },
        });
        expect(error).not.toHaveProperty("result.structuredContent");
        const invalid = await call(server, revision, "invalid");
        expect(invalid).toMatchObject({ result: { isError: true } });
        expect(invalid).not.toHaveProperty("result.structuredContent");
      } finally {
        await server.close();
      }
    });

    it.each(["input", "output"] as const)(
      "honors cancellation during Mini %s validation",
      async (phase) => {
        const started = deferred();
        const release = deferred();
        const check = mini.refine(async () => {
          started.resolve();
          await release.promise;
          return true;
        });
        const execute = vi.fn(() => ({ count: 1 }));
        const input = mini.object({});
        const output = mini.object({ count: mini.number() });
        const server = createServer({
          name: "test",
          version: "1",
          tools: {
            count: tool({
              input: phase === "input" ? input.check(check) : input,
              output: phase === "output" ? output.check(check) : output,
              execute,
            }),
          },
        });
        try {
          const controller = new AbortController();
          const response = call(
            server,
            revision,
            "count",
            {},
            controller.signal,
          );
          await started.promise;
          controller.abort();
          release.resolve();
          expect(await response).toBeUndefined();
          expect(execute).toHaveBeenCalledTimes(phase === "input" ? 0 : 1);
        } finally {
          release.resolve();
          await server.close();
        }
      },
    );
  },
);

it("rejects non-object Mini inputs and unrepresentable Mini outputs at construction", () => {
  expect(() =>
    createServer({
      name: "test",
      version: "1",
      tools: {
        bad: tool({ input: mini.string(), execute: (value) => value }),
      },
    }),
  ).toThrow(ToolSchemaError);
  expect(() =>
    createServer({
      name: "test",
      version: "1",
      tools: {
        bad: tool({
          input: mini.object({}),
          output: mini.date(),
          execute: () => new Date(),
        }),
      },
    }),
  ).toThrow(ToolSchemaError);
});

it("preserves Mini schema, parsed-input, and handler-return inference", () => {
  const definition = tool({
    input: miniInput,
    output: miniOutput,
    execute({ count }, ctx) {
      expectTypeOf(count).toEqualTypeOf<number>();
      expectTypeOf(ctx).toEqualTypeOf<ToolContext>();
      return { count: String(count) };
    },
  });
  expectTypeOf(definition.input).toEqualTypeOf<typeof miniInput>();
  expectTypeOf(definition.execute({ count: 2 }, toolContext())).toEqualTypeOf<{
    count: string;
  }>();
  // @ts-expect-error Mini handlers receive the parsed number, not the input string.
  tool({ input: miniInput, execute: ({ count }: { count: string }) => count });
  // @ts-expect-error Mini output schemas constrain the raw handler return value.
  tool({ input: miniInput, output: miniOutput, execute: () => ({ count: 1 }) });
  tool({
    input: miniInput,
    // @ts-expect-error Mini output schemas also constrain explicit structured errors.
    output: miniOutput,
    execute: () =>
      mcpResult({
        content: [],
        isError: true,
        structuredContent: { count: 1 },
      }),
  });
  // @ts-expect-error Mini tools without output schemas still require JSON-compatible returns.
  tool({ input: miniInput, execute: () => new Date() });
});
