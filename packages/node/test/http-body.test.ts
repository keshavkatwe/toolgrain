import type { IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";
import { expect, it } from "vitest";
import { requestBody } from "../src/http-body.js";

it("reads chunks and ends without leaving listeners", async () => {
  const input = new PassThrough();
  const reader = requestBody(input as unknown as IncomingMessage).getReader();
  input.write(Buffer.from("one"));
  expect(Buffer.from((await reader.read()).value ?? []).toString()).toBe("one");
  input.end();
  expect((await reader.read()).done).toBe(true);
  expect(input.listenerCount("data")).toBe(0);
});
it.each(["error", "aborted"])(
  "reports %s and detaches listeners",
  async (event) => {
    const input = new PassThrough();
    const reader = requestBody(input as unknown as IncomingMessage).getReader();
    input.emit(event, new Error("failure"));
    await expect(reader.read()).rejects.toThrow();
    expect(input.listenerCount("data")).toBe(0);
  },
);
it("cancels consumption without destroying the supplied stream", async () => {
  const input = new PassThrough();
  const reader = requestBody(input as unknown as IncomingMessage).getReader();
  await reader.cancel();
  expect(input.destroyed).toBe(false);
  expect(input.listenerCount("data")).toBe(0);
});
