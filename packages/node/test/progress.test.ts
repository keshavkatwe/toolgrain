import { PassThrough } from "node:stream";
import { createServer, type ToolContext, tool } from "@toolgrain/mcp";
import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { http, stdio } from "../src/index.js";

const revisions = [PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const;
const call = (revision: SupportedProtocolVersion) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "work",
    arguments: {},
    _meta: {
      progressToken: "job",
      ...(revision === PROTOCOL_VERSION
        ? {
            "io.modelcontextprotocol/protocolVersion": revision,
            "io.modelcontextprotocol/clientCapabilities": {},
          }
        : {}),
    },
  },
});

it.each(revisions)(
  "delivers newline-framed progress and the final response over real %s stdio streams",
  async (revision) => {
    const input = new PassThrough();
    const output = new PassThrough();
    const messages: Record<string, unknown>[] = [];
    output.on("data", (chunk) => {
      for (const line of String(chunk).trim().split("\n"))
        messages.push(JSON.parse(line));
    });
    const server = createServer({
      name: "progress",
      version: "1",
      tools: {
        work: tool({
          input: z.object({}),
          async execute(_input, ctx) {
            await ctx.reportProgress({ progress: 1, total: 2 });
            await ctx.reportProgress({ progress: 2, total: 2 });
            return "done";
          },
        }),
      },
    });
    await server.listen(stdio({ input, output }));
    try {
      if (revision === LEGACY_PROTOCOL_VERSION) {
        input.write(
          `${JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: revision, capabilities: {}, clientInfo: { name: "test", version: "1" } } })}\n`,
        );
        await vi.waitFor(() => expect(messages).toHaveLength(1));
        input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
        messages.length = 0;
      }
      input.write(`${JSON.stringify(call(revision))}\n`);
      await vi.waitFor(() => expect(messages).toHaveLength(3));
      expect(messages.slice(0, 2)).toEqual(
        [1, 2].map((progress) => ({
          jsonrpc: "2.0",
          method: "notifications/progress",
          params: { progressToken: "job", progress, total: 2 },
        })),
      );
      expect(messages[2]).toHaveProperty("id", 1);
      expect(messages[2]).toHaveProperty("result.content", [
        { type: "text", text: "done" },
      ]);
    } finally {
      await server.close();
      input.destroy();
      output.destroy();
    }
  },
);

it.each(revisions)(
  "delivers SSE progress before a tool finishes on a managed %s HTTP listener",
  async (revision) => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let context: ToolContext | undefined;
    const server = createServer({
      name: "progress",
      version: "1",
      tools: {
        work: tool({
          input: z.object({}),
          async execute(_input, ctx) {
            context = ctx;
            await ctx.reportProgress({ progress: 1 });
            await gate;
            return "done";
          },
        }),
      },
    });
    const transport = http({ port: 0 });
    await server.listen(transport);
    const address = transport.address();
    if (!address) throw new Error("Missing listener address");
    const url = `http://127.0.0.1:${address.port}/mcp`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": revision,
          "Mcp-Method": "tools/call",
          "Mcp-Name": "work",
        },
        body: JSON.stringify(call(revision)),
      });
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      if (!response.body) throw new Error("Missing stream body");
      const reader = response.body.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain(
        '"method":"notifications/progress"',
      );
      expect(context?.signal.aborted).toBe(false);
      finish();
      let remainder = "";
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        remainder += new TextDecoder().decode(next.value);
      }
      expect(remainder).toContain('"id":1');
      expect(remainder).toContain('"text":"done"');
    } finally {
      finish();
      await server.close();
    }
  },
);

it("aborts only the SSE invocation when a Node HTTP client cancels its response body", async () => {
  let context: ToolContext | undefined;
  const server = createServer({
    name: "progress",
    version: "1",
    tools: {
      work: tool({
        input: z.object({}),
        async execute(_input, ctx) {
          context = ctx;
          await ctx.reportProgress({ progress: 1 });
          await new Promise<void>((resolve) => {
            if (ctx.signal.aborted) resolve();
            else
              ctx.signal.addEventListener("abort", () => resolve(), {
                once: true,
              });
          });
          return "late";
        },
      }),
    },
  });
  const transport = http({ port: 0 });
  await server.listen(transport);
  try {
    const response = await fetch(
      `http://127.0.0.1:${transport.address()?.port}/mcp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": PROTOCOL_VERSION,
          "Mcp-Method": "tools/call",
          "Mcp-Name": "work",
        },
        body: JSON.stringify(call(PROTOCOL_VERSION)),
      },
    );
    if (!response.body) throw new Error("Missing stream body");
    const reader = response.body.getReader();
    await reader.read();
    await reader.cancel();
    await vi.waitFor(() => expect(context?.signal.aborted).toBe(true));
    expect(transport.address()).toBeDefined();
  } finally {
    await server.close();
  }
});
