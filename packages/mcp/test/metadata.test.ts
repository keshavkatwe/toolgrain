import { PROTOCOL_VERSION, type RequestMetaObject } from "@toolgrain/protocol";
import { expect, it } from "vitest";
import { metadata } from "../src/modern/metadata.js";

it("preserves extension metadata and agrees with official request metadata", () => {
  const parsed = metadata.parse({
    "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
    "io.modelcontextprotocol/clientCapabilities": {},
    "com.example/extra": { key: 1 },
  });
  expect(parsed["com.example/extra"]).toEqual({ key: 1 });
  const official: RequestMetaObject = {
    "io.modelcontextprotocol/protocolVersion":
      parsed["io.modelcontextprotocol/protocolVersion"],
    "io.modelcontextprotocol/clientCapabilities": {},
  };
  expect(official["io.modelcontextprotocol/protocolVersion"]).toBe(
    PROTOCOL_VERSION,
  );
});
