import { Buffer } from "node:buffer";
import { runInNewContext } from "node:vm";
import { LEGACY_PROTOCOL_VERSION, PROTOCOL_VERSION } from "@toolgrain/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { content, createServer, mcpResult, tool } from "../../src/index.js";

describe("binary content", () => {
  it.each([
    { label: "image", make: content.image },
    { label: "audio", make: content.audio },
  ])("$label encodes empty, padded, and complete byte groups", ({ make }) => {
    for (const bytes of [
      [],
      [0],
      [0, 255],
      [0, 127, 255],
      [0, 127, 255, 128],
    ]) {
      const data = Uint8Array.from(bytes);
      expect(make({ data, mimeType: "application/octet-stream" }).data).toBe(
        Buffer.from(bytes).toString("base64"),
      );
      expect(data).toEqual(Uint8Array.from(bytes));
    }
  });

  it("encodes large byte views and Buffers without including the backing buffer", () => {
    const data = Uint8Array.from(
      { length: 200_003 },
      (_, index) => index % 256,
    );
    for (const view of [
      data.subarray(1, -1),
      Buffer.from(data).subarray(3, -2),
      runInNewContext("new Uint8Array([0, 128, 255])") as Uint8Array,
    ]) {
      const expected = Buffer.from(view).toString("base64");
      const image = content.image({ data: view, mimeType: "image/png" });
      const audio = content.audio({ data: view, mimeType: "audio/wav" });
      const file = content.resource({ uri: "report:///data.bin", blob: view });
      expect(image.data).toBe(expected);
      expect(audio.data).toBe(expected);
      expect(file.resource).toEqual({
        uri: "report:///data.bin",
        blob: expected,
      });
      view.fill(0);
      expect(image.data).toBe(expected);
      expect(audio.data).toBe(expected);
      expect(file.resource).toHaveProperty("blob", expected);
    }
  });

  it("passes already encoded strings through without re-encoding", () => {
    const data = "AP+A";
    expect(content.image({ data, mimeType: "image/png" }).data).toBe(data);
    expect(content.audio({ data, mimeType: "audio/wav" }).data).toBe(data);
    expect(
      content.resource({ uri: "report:///data.bin", blob: data }).resource,
    ).toHaveProperty("blob", data);
    expect(
      content.resource({ uri: "report:///empty.bin", blob: "" }).resource,
    ).toHaveProperty("blob", "");
  });
});

describe.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "content helpers (%s)",
  (revision) => {
    it("composes readonly mixed content with parsed structured output and separate metadata", async () => {
      const options = Object.freeze({
        annotations: Object.freeze({
          audience: Object.freeze(["assistant"] as const),
          priority: 0.5,
          lastModified: "2026-10-28T00:00:00Z",
        }),
        _meta: Object.freeze({ "example.com/block": { id: "block" } }),
      });
      const embedded = Object.freeze({
        uri: "report:///summary.txt",
        text: "Résumé 世界",
        mimeType: "text/plain",
        _meta: Object.freeze({ "example.com/resource": { id: "resource" } }),
      });
      const link = Object.freeze({
        uri: "https://example.com/report.pdf",
        name: "report.pdf",
        title: "Report",
        description: "Download the report",
        mimeType: "application/pdf",
        size: 100,
        icons: Object.freeze([
          Object.freeze({
            src: "https://example.com/report.png",
            sizes: Object.freeze(["48x48"]),
          }),
        ]),
        ...options,
      });
      const png =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
      const blocks = [
        content.text("Report ready", options),
        content.image({
          data: Buffer.from(png, "base64"),
          mimeType: "image/png",
          ...options,
        }),
        content.audio({
          data: new Uint8Array([0, 128, 255]),
          mimeType: "audio/wav",
          ...options,
        }),
        content.resourceLink(link),
        content.resource(embedded, options),
        content.resource({
          uri: "report:///data.bin",
          blob: new Uint8Array([255]),
        }),
      ];
      const server = createServer({
        name: "content",
        version: "1",
        tools: {
          report: tool({
            input: z.object({}),
            output: z.object({
              count: z.string().transform(Number).pipe(z.number()),
            }),
            execute: () =>
              mcpResult({ content: blocks, structuredContent: { count: "2" } }),
          }),
        },
      });
      try {
        const response = await server.handle(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "report",
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
          { protocolVersion: revision },
        );
        const { icons, ...legacyLink } = link;
        expect(response).toMatchObject({
          result: {
            structuredContent: { count: 2 },
            content: [
              { ...options, type: "text", text: "Report ready" },
              { ...options, type: "image", data: png, mimeType: "image/png" },
              {
                ...options,
                type: "audio",
                data: "AID/",
                mimeType: "audio/wav",
              },
              {
                ...(revision === PROTOCOL_VERSION ? link : legacyLink),
                type: "resource_link",
              },
              { ...options, type: "resource", resource: embedded },
              {
                type: "resource",
                resource: { uri: "report:///data.bin", blob: "/w==" },
              },
              { type: "text", text: '{"count":2}' },
            ],
          },
        });
        if (revision === LEGACY_PROTOCOL_VERSION)
          expect(response).not.toHaveProperty("result.content.3.icons");
        expect(blocks[3]).toHaveProperty("icons", icons);
        expect(blocks).toHaveLength(6);
        expect(response).toHaveProperty(
          "result.content.4._meta",
          options._meta,
        );
        expect(response).toHaveProperty(
          "result.content.4.resource._meta",
          embedded._meta,
        );
        expect(response).not.toHaveProperty("error");
      } finally {
        await server.close();
      }
    });

    it("keeps helper blocks as ordinary application data unless wrapped", async () => {
      const block = content.text("Plain data");
      const server = createServer({
        name: "plain",
        version: "1",
        tools: {
          plain: tool({
            input: z.object({}),
            output: z.object({ type: z.literal("text"), text: z.string() }),
            execute: () => block,
          }),
        },
      });
      try {
        const response = await server.handle(
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "plain",
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
          { protocolVersion: revision },
        );
        expect(response).toHaveProperty("result.structuredContent", block);
        expect(response).toHaveProperty("result.content", [
          { type: "text", text: JSON.stringify(block) },
        ]);
      } finally {
        await server.close();
      }
    });
  },
);
