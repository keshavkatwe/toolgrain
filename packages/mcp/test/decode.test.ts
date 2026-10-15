import { expect, it } from "vitest";
import { decode } from "../src/protocol/decode.js";

it("rejects fractional request IDs without echoing an invalid ID", () => {
  for (const id of [1.5, -0.5]) {
    expect(decode({ jsonrpc: "2.0", id, method: "tools/list" })).toEqual({
      kind: "error",
      response: {
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid request" },
      },
    });
  }
});

it("ignores cancellation notifications with fractional request IDs", () => {
  for (const requestId of [1.5, -0.5]) {
    expect(
      decode({
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId },
      }),
    ).toEqual({ kind: "ignore" });
  }
});

it("accepts string and integer IDs in requests and cancellation notifications", () => {
  for (const id of ["request-1", 0, -1, 42]) {
    const request = { jsonrpc: "2.0", id, method: "tools/list" };
    expect(decode(request)).toEqual({ kind: "request", request });
    expect(
      decode({
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId: id },
      }),
    ).toEqual({ kind: "cancel", id });
  }
});
