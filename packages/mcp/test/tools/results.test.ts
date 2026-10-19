import { expect, it } from "vitest";
import { toolResult } from "../../src/tools/results.js";

it("converts strings to text and JSON values to structured content and text", () => {
  expect(toolResult("hello")).toEqual({
    content: [{ type: "text", text: "hello" }],
  });
  for (const value of [null, true, 1, [], [1, null], { a: "value" }]) {
    expect(toolResult(value)).toEqual({
      structuredContent: value,
      content: [{ type: "text", text: JSON.stringify(value) }],
    });
  }
});

it("rejects unsupported values without silently dropping data", () => {
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  for (const value of [
    undefined,
    () => 1,
    Symbol("s"),
    1n,
    Infinity,
    NaN,
    new Date(),
    new Map(),
    new Set(),
    cycle,
    Array(2),
    { value: undefined },
    { value: 1n },
    { [Symbol("s")]: 1 },
    Object.defineProperty({}, "hidden", { value: 1 }),
    {
      get value() {
        return 1;
      },
    },
  ]) {
    expect(() => toolResult(value)).toThrow();
  }
});

it("accepts shared references and captures outputs as a JSON snapshot", () => {
  const shared = { value: 1 };
  const output = toolResult({ first: shared, second: shared });
  shared.value = 2;
  expect(output.structuredContent).toEqual({
    first: { value: 1 },
    second: { value: 1 },
  });
});
