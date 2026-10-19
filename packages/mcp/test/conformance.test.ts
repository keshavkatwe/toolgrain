import { readFileSync } from "node:fs";
import { LEGACY_PROTOCOL_VERSION, PROTOCOL_VERSION } from "@toolgrain/protocol";
import { Ajv, type AnySchema, type ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createServer, mcpResult, tool } from "../src/index.js";

// Wire responses are checked against the official upstream JSON Schemas, which
// the protocol package vendors from the same pinned commit as its TypeScript schemas.
function loadSchema(revision: string): AnySchema {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../protocol/src/vendor/${revision}/schema.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

const formats = {
  uri: (value: string) => URL.canParse(value),
  byte: /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
  "uri-template": () => true,
};
// Upstream RequestId is a string/integer type union.
const ajvOptions = { allErrors: true, allowUnionTypes: true, formats };
const modern = new Ajv2020(ajvOptions);
modern.addSchema(loadSchema(PROTOCOL_VERSION), "modern");
const legacy = new Ajv(ajvOptions);
legacy.addSchema(loadSchema(LEGACY_PROTOCOL_VERSION), "legacy");

const definition = (ajv: Ajv | Ajv2020, ref: string) => {
  const validate = ajv.getSchema(ref);
  if (!validate) throw new Error(`Missing schema definition: ${ref}`);
  return validate;
};
function expectValid(validate: ValidateFunction, value: unknown) {
  const valid = validate(value);
  expect(
    valid,
    `${JSON.stringify(validate.errors, null, 2)}\n${JSON.stringify(value, null, 2)}`,
  ).toBe(true);
}

it("rejects malformed results in both revisions", () => {
  const malformed = { content: [{ type: "text" }], isError: "no" };
  for (const validate of [
    definition(modern, "modern#/$defs/CallToolResult"),
    definition(legacy, "legacy#/definitions/CallToolResult"),
  ])
    expect(validate(malformed)).toBe(false);
});

const icon = {
  src: "https://example.com/icon.png",
  mimeType: "image/png",
  sizes: ["48x48"],
  theme: "light" as const,
};
const server = createServer({
  name: "conformance",
  version: "1.0.0",
  instructions: "Use the tools.",
  tools: {
    greet: tool({
      title: "Greeting",
      description: "Greet someone",
      annotations: { readOnlyHint: true, title: "Greet" },
      icons: [icon],
      _meta: { "example.com/owner": "tests" },
      input: z.object({ name: z.string().min(1) }),
      execute: ({ name }) => `Hello, ${name}!`,
    }),
    data: tool({
      input: z.object({ count: z.number().int().default(1) }),
      output: z.object({ count: z.number(), labels: z.array(z.string()) }),
      execute: ({ count }) => ({ count, labels: ["a", "b"] }),
    }),
    list: tool({
      input: z.object({}),
      output: z.array(z.number()),
      execute: () => [1, 2, 3],
    }),
    plain: tool({ input: z.object({}), execute: () => [{ ok: true }, null] }),
    rich: tool({
      input: z.object({}),
      execute: () =>
        mcpResult({
          content: [
            {
              type: "text",
              text: "summary",
              annotations: { audience: ["user"], priority: 0.5 },
            },
            { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
            { type: "audio", data: "aGVsbG8=", mimeType: "audio/wav" },
            {
              type: "resource_link",
              uri: "file:///notes.txt",
              name: "notes",
              mimeType: "text/plain",
              size: 5,
              icons: [icon],
            },
            {
              type: "resource",
              resource: {
                uri: "file:///a.txt",
                text: "a",
                mimeType: "text/plain",
              },
            },
            {
              type: "resource",
              resource: { uri: "file:///b.bin", blob: "aGVsbG8=" },
            },
          ],
          structuredContent: { summary: "summary" },
          _meta: { "example.com/trace": "1" },
        }),
    }),
    refuse: tool({
      input: z.object({}),
      execute: () =>
        mcpResult({
          content: [{ type: "text", text: "Refused" }],
          isError: true,
        }),
    }),
    fail: tool({
      input: z.object({}),
      execute: () => {
        throw new Error("Tool failed");
      },
    }),
  },
});

// An unrepresentable request ID produces an error response without an ID.
const invalidId = { jsonrpc: "2.0", id: 1.5, method: "tools/list" };
const calls = [
  { name: "greet", arguments: { name: "Ada" } },
  { name: "greet", arguments: { name: "" } },
  { name: "data", arguments: {} },
  { name: "list" },
  { name: "plain" },
  { name: "rich" },
  { name: "refuse" },
  { name: "fail" },
];

describe(`modern ${PROTOCOL_VERSION} responses`, () => {
  const meta = {
    "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
    "io.modelcontextprotocol/clientCapabilities": {},
  };
  const request = (method: string, params: object = {}, id = 1) =>
    server.handle({
      jsonrpc: "2.0",
      id,
      method,
      params: { _meta: meta, ...params },
    });
  const errorResponse = definition(
    modern,
    "modern#/$defs/JSONRPCErrorResponse",
  );

  it("conform for discovery and tool listing", async () => {
    expectValid(
      definition(modern, "modern#/$defs/DiscoverResultResponse"),
      await request("server/discover"),
    );
    expectValid(
      definition(modern, "modern#/$defs/ListToolsResultResponse"),
      await request("tools/list"),
    );
  });

  it.each(calls)("conform for tools/call $name", async (params) => {
    expectValid(
      definition(modern, "modern#/$defs/CallToolResultResponse"),
      await request("tools/call", params),
    );
  });

  it("conform for protocol errors", async () => {
    for (const response of [
      await request("unknown/method"),
      await request("tools/call", { name: "missing" }),
      await request("tools/list", { cursor: "next" }),
      await server.handle({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {
          _meta: {
            ...meta,
            "io.modelcontextprotocol/protocolVersion": "2099-01-01",
          },
        },
      }),
      await server.handle(invalidId),
    ])
      expectValid(errorResponse, response);
  });
});

describe(`legacy ${LEGACY_PROTOCOL_VERSION} responses`, () => {
  const options = { protocolVersion: LEGACY_PROTOCOL_VERSION } as const;
  const request = (method: string, params?: object, id = 1) =>
    server.handle(
      {
        jsonrpc: "2.0",
        id,
        method,
        ...(params === undefined ? {} : { params }),
      },
      options,
    );
  const response = definition(legacy, "legacy#/definitions/JSONRPCResponse");
  const errorResponse = definition(legacy, "legacy#/definitions/JSONRPCError");
  const expectResult = async (
    name: string,
    pending: ReturnType<typeof request>,
  ) => {
    const message = await pending;
    expectValid(response, message);
    expectValid(
      definition(legacy, `legacy#/definitions/${name}`),
      (message as { result: unknown }).result,
    );
  };

  it("conform for initialization, ping, and tool listing", async () => {
    await expectResult(
      "InitializeResult",
      server.handle({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LEGACY_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "client", version: "1" },
        },
      }),
    );
    await expectResult("EmptyResult", request("ping"));
    await expectResult("ListToolsResult", request("tools/list"));
  });

  it.each(calls)("conform for tools/call $name", async (params) => {
    await expectResult("CallToolResult", request("tools/call", params));
  });

  it("conform for protocol errors with request IDs", async () => {
    for (const message of [
      await request("unknown/method"),
      await request("tools/call", { name: "missing" }),
      await request("tools/list", { cursor: "next" }),
    ])
      expectValid(errorResponse, message);
  });

  it("use JSON-RPC null IDs where the legacy schema requires a request ID", async () => {
    // JSON-RPC 2.0 requires `id: null` when the request ID is unknown; the
    // 2025-06-18 schema cannot express that, so only the error object is checked.
    const message = await server.handle(invalidId, options);
    expect(message).toHaveProperty("id", null);
    expectValid(
      definition(legacy, "legacy#/definitions/JSONRPCError/properties/error"),
      (message as { error: unknown }).error,
    );
  });
});
