import type { Tool } from "@toolgrain/protocol";
import { expect, it } from "vitest";
import { validateHeaders } from "../src/headers.js";
import { object } from "../src/object.js";
import { parameterHeaders } from "../src/parameter-headers.js";

const definition = (schema: object): Tool => ({
  name: "test",
  inputSchema: { type: "object", ...schema },
});
it("validates parameter annotations", () => {
  for (const schema of [
    { "x-mcp-header": "Root" },
    { properties: { x: { type: "number", "x-mcp-header": "X" } } },
    { properties: { x: { type: "string", "x-mcp-header": "" } } },
    {
      properties: {
        x: { type: "string", "x-mcp-header": "X" },
        y: { type: "string", "x-mcp-header": "x" },
      },
    },
    { anyOf: [{ properties: { x: { type: "string", "x-mcp-header": "X" } } }] },
  ])
    expect(() => parameterHeaders([definition(schema)])).toThrow();
  expect(object([])).toBeUndefined();
});
it("compares nested primitive headers, nulls, missing values and integers", () => {
  const parameters = parameterHeaders([
    definition({
      properties: {
        nested: {
          type: "object",
          properties: { x: { type: "integer", "x-mcp-header": "X" } },
        },
      },
    }),
  ]);
  const headers = new Headers({
    "MCP-Protocol-Version": "v",
    "Mcp-Method": "tools/call",
    "Mcp-Name": "test",
  });
  const body = (value: unknown) => ({
    method: "tools/call",
    params: {
      name: "test",
      _meta: { "io.modelcontextprotocol/protocolVersion": "v" },
      arguments: { nested: { x: value } },
    },
  });
  for (const value of [null, undefined])
    expect(() =>
      validateHeaders(headers, body(value), parameters),
    ).not.toThrow();
  expect(() => validateHeaders(headers, body(42), parameters)).toThrow();
  headers.set("Mcp-Param-X", "42.0");
  expect(() => validateHeaders(headers, body(42), parameters)).not.toThrow();
  for (const value of [null, undefined, 43, Number.MAX_SAFE_INTEGER + 1])
    expect(() => validateHeaders(headers, body(value), parameters)).toThrow();
  headers.set("Mcp-Param-X", "");
  expect(() => validateHeaders(headers, body(42), parameters)).toThrow();
});
it("compares non-integer values and nested metadata without annotations", () => {
  const parameters = parameterHeaders([
    definition({
      properties: {
        x: { type: "string", "x-mcp-header": "X", description: "test" },
        other: { type: "string", default: "value" },
      },
    }),
  ]);
  const body = {
    method: "tools/call",
    params: {
      name: "test",
      _meta: { "io.modelcontextprotocol/protocolVersion": "v" },
      arguments: { x: "世界" },
    },
  };
  const headers = new Headers({
    "MCP-Protocol-Version": "v",
    "Mcp-Method": "tools/call",
    "Mcp-Name": "test",
    "Mcp-Param-X": "=?base64?5LiW55WM?=",
  });
  expect(() => validateHeaders(headers, body, parameters)).not.toThrow();
  headers.set("Mcp-Param-X", "bad");
  expect(() => validateHeaders(headers, body, parameters)).toThrow();
  expect(() =>
    validateHeaders(
      new Headers({
        "MCP-Protocol-Version": "v",
        "Mcp-Method": "tools/call",
        "Mcp-Name": "unknown",
      }),
      { ...body, params: { ...body.params, name: "unknown" } },
      parameters,
    ),
  ).not.toThrow();
});
it("does not extract inherited argument properties", () => {
  const parameters = parameterHeaders([
    definition({
      properties: {
        constructor: { type: "string", "x-mcp-header": "Constructor" },
      },
    }),
  ]);
  expect(() =>
    validateHeaders(
      new Headers({
        "MCP-Protocol-Version": "v",
        "Mcp-Method": "tools/call",
        "Mcp-Name": "test",
      }),
      {
        method: "tools/call",
        params: {
          name: "test",
          _meta: { "io.modelcontextprotocol/protocolVersion": "v" },
          arguments: {},
        },
      },
      parameters,
    ),
  ).not.toThrow();
});

it("preserves a leading BOM when comparing encoded names", () => {
  const headers = new Headers({
    "MCP-Protocol-Version": "v",
    "Mcp-Method": "tools/call",
    "Mcp-Name": "=?base64?77u/dGVzdA==?=",
  });
  const body = {
    method: "tools/call",
    params: {
      name: "test",
      _meta: { "io.modelcontextprotocol/protocolVersion": "v" },
    },
  };
  expect(() => validateHeaders(headers, body, new Map())).toThrow();
  body.params.name = "\uFEFFtest";
  expect(() => validateHeaders(headers, body, new Map())).not.toThrow();
});
