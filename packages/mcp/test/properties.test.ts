import fc from "fast-check";
import { expect, it } from "vitest";
import { z } from "zod";
import { mcpResult } from "../src/index.js";
import { decode } from "../src/protocol/decode.js";
import { assertJSON } from "../src/tools/json-value.js";
import { resolveToolResult, toolResult } from "../src/tools/results.js";

const requestId = fc.oneof(fc.string(), fc.integer());
// Zod record parsing drops own `__proto__` keys; a dedicated test covers that.
const params = fc.dictionary(
  fc.string().filter((key) => key !== "__proto__"),
  fc.jsonValue(),
);
const poison = fc.constantFrom<unknown>(
  undefined,
  () => 1,
  Symbol("s"),
  1n,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  new Date(0),
  new Map(),
);
/** A JSON container with exactly one non-JSON value somewhere inside it. */
const { node: poisoned } = fc.letrec<{ node: unknown }>((tie) => ({
  node: fc.oneof(
    { depthSize: "small" },
    poison,
    fc
      .tuple(fc.array(fc.jsonValue()), tie("node"), fc.nat())
      .map(([items, value, index]) => {
        const array: unknown[] = [...items];
        array.splice(index % (array.length + 1), 0, value);
        return array;
      }),
    fc
      .tuple(params, fc.string(), tie("node"))
      .map(([object, key, value]) => ({ ...object, [key]: value })),
  ),
}));
const textBlocks = (content: { type: string; text?: string }[], text: string) =>
  content.filter((block) => block.type === "text" && block.text === text)
    .length;

it("accepts every JSON value and converts it losslessly", () => {
  fc.assert(
    fc.property(fc.jsonValue(), (value) => {
      assertJSON(value);
      const result = toolResult(value);
      if (typeof value === "string") {
        expect(result).toEqual({ content: [{ type: "text", text: value }] });
        return;
      }
      const text = JSON.stringify(value);
      expect(result.content).toEqual([{ type: "text", text }]);
      expect(result.structuredContent).toEqual(JSON.parse(text));
    }),
  );
});

it("rejects a non-JSON value at any depth", () => {
  fc.assert(
    fc.property(poisoned, (value) => {
      expect(() => assertJSON(value)).toThrow();
      expect(() => toolResult(value)).toThrow();
    }),
  );
});

it("supplies exactly one serialized text block for explicit structured content", () => {
  fc.assert(
    fc.property(fc.jsonValue(), fc.boolean(), (value, includeText) => {
      const text = JSON.stringify(value);
      const result = toolResult(
        mcpResult({
          content: includeText ? [{ type: "text", text }] : [],
          structuredContent: value as never,
        }),
      );
      expect(textBlocks(result.content, text)).toBe(1);
    }),
  );
});

it("replaces raw serialized text after output parsing transforms data", async () => {
  const output = z
    .record(z.string(), z.number())
    .transform((value) =>
      Object.fromEntries(Object.entries(value).map(([k, n]) => [k, n * 2])),
    );
  await fc.assert(
    fc.asyncProperty(
      fc.dictionary(fc.string(), fc.integer({ min: 1, max: 1000 }), {
        minKeys: 1,
      }),
      async (value) => {
        const raw = JSON.stringify(value);
        const result = await resolveToolResult(
          "double",
          mcpResult({
            content: [{ type: "text", text: raw }],
            structuredContent: value,
          }),
          output,
        );
        const parsed = JSON.stringify(result.structuredContent);
        expect(parsed).not.toBe(raw);
        expect(textBlocks(result.content, parsed)).toBe(1);
        expect(textBlocks(result.content, raw)).toBe(0);
      },
    ),
  );
});

it("decodes every valid request and notification unchanged", () => {
  fc.assert(
    fc.property(
      requestId,
      fc.string(),
      fc.option(params, { nil: undefined }),
      (id, method, params) => {
        const request = {
          jsonrpc: "2.0",
          id,
          method,
          ...(params === undefined ? {} : { params }),
        };
        expect(decode(request)).toEqual({ kind: "request", request });
        if (method === "notifications/cancelled") return;
        const { id: _id, ...notification } = request;
        expect(decode(notification)).toEqual({
          kind: "notification",
          notification,
        });
      },
    ),
  );
});

it("decodes cancellations by request ID", () => {
  fc.assert(
    fc.property(requestId, (id) => {
      expect(
        decode({
          jsonrpc: "2.0",
          method: "notifications/cancelled",
          params: { requestId: id },
        }),
      ).toEqual({ kind: "cancel", id });
    }),
  );
});

it("ignores every well-formed client response", () => {
  fc.assert(
    fc.property(
      fc.oneof(requestId, fc.constant(null)),
      fc.oneof(
        params.map((result) => ({ result })),
        fc
          .record({ code: fc.integer(), message: fc.string() })
          .map((error) => ({ error })),
      ),
      (id, outcome) => {
        expect(decode({ jsonrpc: "2.0", id, ...outcome })).toEqual({
          kind: "ignore",
        });
      },
    ),
  );
});

it("classifies arbitrary input without throwing or echoing invalid IDs", () => {
  fc.assert(
    fc.property(fc.anything(), (message) => {
      const incoming = decode(message);
      expect([
        "request",
        "cancel",
        "notification",
        "ignore",
        "error",
      ]).toContain(incoming.kind);
      if (incoming.kind !== "error") return;
      const id = incoming.response.id;
      if (id !== undefined)
        expect(typeof id === "string" || Number.isInteger(id)).toBe(true);
      if (
        typeof message === "object" &&
        message !== null &&
        Object.hasOwn(message, "id")
      ) {
        const original = (message as { id: unknown }).id;
        if (typeof original === "string" || Number.isInteger(original))
          expect(id).toBe(original);
      }
    }),
  );
});

it("drops own __proto__ parameter keys without changing prototypes", async () => {
  const message = JSON.parse(
    '{"jsonrpc":"2.0","id":1,"method":"m","params":{"__proto__":{"admin":true},"a":1}}',
  );
  const incoming = decode(message);
  expect(incoming.kind).toBe("request");
  if (incoming.kind !== "request") return;
  const decoded = incoming.request.params ?? {};
  expect(Object.keys(decoded)).toEqual(["a"]);
  expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
  expect((decoded as { admin?: unknown }).admin).toBeUndefined();
});
