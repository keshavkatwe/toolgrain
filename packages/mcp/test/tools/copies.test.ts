import { PROTOCOL_VERSION } from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import * as mini from "zod/v4/mini";
import { createServer, mcpResult, tool } from "../../src/index.js";

it.each([
  {
    label: "Classic",
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
  },
  {
    label: "Mini",
    input: mini.object({}),
    output: mini.object({ ok: mini.boolean() }),
  },
])(
  "accepts $label tools and rich results from another copy of the package",
  async ({ input, output }) => {
    // Resetting the module registry loads independent classes, like a duplicate install.
    vi.resetModules();
    const copy: typeof import("../../src/index.js") = await import(
      "../../src/index.js"
    );
    expect(copy.tool).not.toBe(tool);
    expect(copy.mcpResult).not.toBe(mcpResult);
    const server = createServer({
      name: "test",
      version: "1",
      tools: {
        shared: copy.tool({
          input,
          output,
          execute: () =>
            copy.mcpResult({
              content: [{ type: "text", text: "From a copy" }],
              structuredContent: { ok: true },
            }),
        }),
      },
    });
    expect(
      await server.handle(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "shared",
            _meta: {
              "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        },
        { protocolVersion: PROTOCOL_VERSION },
      ),
    ).toMatchObject({
      result: {
        content: [
          { type: "text", text: "From a copy" },
          { type: "text", text: '{"ok":true}' },
        ],
        structuredContent: { ok: true },
      },
    });
    // Spreads of a copy's definition still lose the prototype brand.
    const spread = {
      ...copy.tool({ input: z.object({}), execute: () => "" }),
    };
    expect(() =>
      // @ts-expect-error Spreads must pass through tool() again.
      createServer({ name: "test", version: "1", tools: { spread } }),
    ).toThrow("must be created with tool()");
  },
);

it("exposes stable structural brands that object spreads do not keep", () => {
  const definition = tool({ input: z.object({}), execute: () => "" });
  const result = mcpResult({ content: [] });
  expect(definition["~toolgrain"]()).toBe("tool@1");
  expect(result["~toolgrain"]()).toBe("result@1");
  expect(Object.keys(definition)).not.toContain("~toolgrain");
  expect({ ...definition }).not.toHaveProperty("~toolgrain");
});
