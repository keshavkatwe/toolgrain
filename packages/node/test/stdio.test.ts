import { PassThrough, Writable } from "node:stream";
import type { TransportCallbacks } from "@toolgrain/mcp";
import { describe, expect, it, vi } from "vitest";
import { stdio } from "../src/index.js";

function callbacks() {
  return {
    onMessage: vi.fn<TransportCallbacks["onMessage"]>(),
    onParseError: vi.fn<TransportCallbacks["onParseError"]>(),
    onError: vi.fn<TransportCallbacks["onError"]>(),
    onClose: vi.fn<TransportCallbacks["onClose"]>(),
  };
}
const response = (id: number) => ({
  jsonrpc: "2.0" as const,
  id,
  result: { resultType: "complete", content: [] },
});

it("frames multiple messages, partial chunks, CRLF, and split UTF-8", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const transport = stdio({ input, output });
  const received = callbacks();
  await transport.start(received);
  const bytes = Buffer.from('{"name":"Ada 🌍"}\r\n{"id":2}\n');
  const offset = bytes.indexOf(Buffer.from("🌍")) + 2;
  input.write(bytes.subarray(0, offset));
  expect(received.onMessage).not.toHaveBeenCalled();
  input.write(bytes.subarray(offset));
  expect(received.onMessage.mock.calls.map(([message]) => message)).toEqual([
    { name: "Ada 🌍" },
    { id: 2 },
  ]);
  await transport.close();
});

it("reports malformed JSON and UTF-8, then resumes on the next line", async () => {
  const input = new PassThrough();
  const transport = stdio({ input, output: new PassThrough() });
  const received = callbacks();
  await transport.start(received);
  input.write("not-json\n");
  input.write(Buffer.from([0xff, 0x0a]));
  input.write('{"valid":true}\n');
  expect(received.onParseError).toHaveBeenCalledTimes(2);
  expect(received.onMessage).toHaveBeenCalledExactlyOnceWith({ valid: true });
  await transport.close();
});

it("caps incoming bytes and terminates without processing later lines", async () => {
  const input = new PassThrough();
  const transport = stdio({
    input,
    output: new PassThrough(),
    maxMessageBytes: 4,
  });
  const received = callbacks();
  await transport.start(received);
  input.write("12345\n1\n");
  expect(received.onError).toHaveBeenCalledOnce();
  expect(received.onMessage).not.toHaveBeenCalled();
  expect(input.listenerCount("data")).toBe(0);
  await expect(transport.send(response(1))).rejects.toThrow("not open");
});

it("honors a byte limit across chunks and accepts the exact limit", async () => {
  const input = new PassThrough();
  const transport = stdio({
    input,
    output: new PassThrough(),
    maxMessageBytes: 4,
  });
  const received = callbacks();
  await transport.start(received);
  input.write("12");
  input.write("34\n");
  expect(received.onMessage).toHaveBeenCalledExactlyOnceWith(1234);
  input.write("123");
  input.write("45");
  expect(received.onError).toHaveBeenCalledOnce();
});

it("serializes writes and awaits backpressure", async () => {
  const input = new PassThrough();
  const chunks: string[] = [];
  let release: (() => void) | undefined;
  const output = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      release = () => callback();
    },
  });
  const transport = stdio({ input, output });
  await transport.start(callbacks());
  const first = transport.send(response(1));
  const second = transport.send(response(2));
  await vi.waitFor(() => expect(chunks).toHaveLength(1), { interval: 1 });
  release?.();
  await first;
  await vi.waitFor(() => expect(chunks).toHaveLength(2), { interval: 1 });
  release?.();
  await second;
  expect(chunks).toEqual([
    `${JSON.stringify(response(1))}\n`,
    `${JSON.stringify(response(2))}\n`,
  ]);
  await transport.close();
  expect(output.listenerCount("drain")).toBe(0);
});

it("escapes newlines in outgoing content", async () => {
  const output = new PassThrough();
  const transport = stdio({ input: new PassThrough(), output });
  await transport.start(callbacks());
  await transport.send({
    jsonrpc: "2.0",
    id: 1,
    result: {
      resultType: "complete",
      content: [{ type: "text", text: "first\nsecond" }],
    },
  });
  const wire = output.read().toString();
  expect(wire.split("\n")).toHaveLength(2);
  expect(JSON.parse(wire).result.content[0].text).toBe("first\nsecond");
  await transport.close();
});

it("handles EOF and unterminated input, cleaning up listeners", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const transport = stdio({ input, output });
  const received = callbacks();
  await transport.start(received);
  input.end('{"partial":true}');
  await vi.waitFor(() => expect(received.onClose).toHaveBeenCalledOnce(), {
    interval: 1,
  });
  expect(received.onParseError).toHaveBeenCalledOnce();
  expect(received.onMessage).not.toHaveBeenCalled();
  expect(input.listenerCount("data")).toBe(0);
  expect(output.listenerCount("error")).toBe(0);
  expect(output.destroyed).toBe(false);
  await transport.close();
});

it("handles stream errors and rejects failed writes without an unhandled error", async () => {
  const failure = new Error("broken pipe");
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      callback(failure);
    },
  });
  const transport = stdio({ input: new PassThrough(), output });
  const received = callbacks();
  await transport.start(received);
  await expect(transport.send(response(1))).rejects.toBe(failure);
  expect(received.onError).toHaveBeenCalledWith(failure);
});

it("handles input errors and premature output closure", async () => {
  for (const event of ["input-error", "output-close"] as const) {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = stdio({ input, output });
    const received = callbacks();
    await transport.start(received);
    if (event === "input-error") input.destroy(new Error("read failed"));
    else output.destroy();
    await vi.waitFor(
      () =>
        expect(
          event === "input-error" ? received.onError : received.onClose,
        ).toHaveBeenCalledOnce(),
      { interval: 1 },
    );
    expect(input.listenerCount("data")).toBe(0);
  }
});

describe("lifecycle", () => {
  it("requires start, rejects repeated start, and makes close terminal", async () => {
    const transport = stdio({
      input: new PassThrough(),
      output: new PassThrough(),
    });
    await expect(transport.send(response(1))).rejects.toThrow("not open");
    await transport.start(callbacks());
    await expect(transport.start(callbacks())).rejects.toThrow("once");
    await Promise.all([transport.close(), transport.close()]);
    await expect(transport.start(callbacks())).rejects.toThrow("once");
    await expect(transport.send(response(1))).rejects.toThrow("not open");
  });
  it("rejects already-closed streams", async () => {
    const input = new PassThrough();
    input.destroy();
    const transport = stdio({ input, output: new PassThrough() });
    await expect(transport.start(callbacks())).rejects.toThrow(
      "already closed",
    );
  });
  it("validates the message limit", () => {
    for (const maxMessageBytes of [0, -1, 1.5, Infinity])
      expect(() => stdio({ maxMessageBytes })).toThrow(RangeError);
  });
});

it("can attach a replacement after closing a transport on the same streams", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const first = stdio({ input, output });
  const before = callbacks();
  await first.start(before);
  await first.close();
  const replacement = stdio({ input, output });
  const after = callbacks();
  await replacement.start(after);
  input.write('{"reloaded":true}\n');
  expect(before.onMessage).not.toHaveBeenCalled();
  expect(after.onMessage).toHaveBeenCalledExactlyOnceWith({ reloaded: true });
  expect(input.listenerCount("data")).toBe(1);
  await replacement.close();
});

describe("shutdown with pending writes", () => {
  function blockedOutput() {
    let complete: (error?: Error | null) => void = () => {
      throw new Error("No pending write");
    };
    const output = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, callback) {
        complete = callback;
      },
    });
    return { output, complete: (error?: Error) => complete(error) };
  }

  it("rejects active and queued sends on close without ending caller-owned streams", async () => {
    const input = new PassThrough();
    const blocked = blockedOutput();
    const received = callbacks();
    const transport = stdio({ input, output: blocked.output });
    await transport.start(received);
    const sends = Promise.allSettled([
      transport.send(response(1)),
      transport.send(response(2)),
    ]);
    await vi.waitFor(
      () => expect(blocked.output.writableLength).toBeGreaterThan(0),
      { interval: 1 },
    );
    await transport.close();
    const outcomes = await sends;
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(received.onClose).not.toHaveBeenCalled();
    expect(received.onError).not.toHaveBeenCalled();
    expect(input.listenerCount("data")).toBe(0);
    expect(blocked.output.listenerCount("drain")).toBe(0);
    expect(blocked.output.destroyed).toBe(false);
    expect(blocked.output.writableEnded).toBe(false);
    blocked.complete();
    await vi.waitFor(
      () => {
        expect(blocked.output.listenerCount("error")).toBe(0);
        expect(blocked.output.listenerCount("close")).toBe(0);
      },
      { interval: 1 },
    );
  });

  it("consumes late write errors after explicit close and releases their listeners", async () => {
    const blocked = blockedOutput();
    const received = callbacks();
    const transport = stdio({
      input: new PassThrough(),
      output: blocked.output,
    });
    await transport.start(received);
    const outcome = Promise.allSettled([transport.send(response(1))]);
    await vi.waitFor(
      () => expect(blocked.output.writableLength).toBeGreaterThan(0),
      { interval: 1 },
    );
    await transport.close();
    expect((await outcome)[0]?.status).toBe("rejected");
    blocked.complete(new Error("late broken pipe"));
    await vi.waitFor(
      () => {
        expect(blocked.output.listenerCount("error")).toBe(0);
        expect(blocked.output.listenerCount("close")).toBe(0);
      },
      { interval: 1 },
    );
    expect(received.onError).not.toHaveBeenCalled();
  });

  it.each(["eof", "input-error", "output-close"] as const)(
    "settles sends when shutdown comes from %s",
    async (event) => {
      const input = new PassThrough();
      const blocked = blockedOutput();
      const received = callbacks();
      const transport = stdio({ input, output: blocked.output });
      await transport.start(received);
      const outcomes = Promise.allSettled([
        transport.send(response(1)),
        transport.send(response(2)),
      ]);
      await vi.waitFor(
        () => expect(blocked.output.writableLength).toBeGreaterThan(0),
        { interval: 1 },
      );
      if (event === "eof") input.end();
      else if (event === "input-error") input.destroy(new Error("read failed"));
      else blocked.output.destroy();
      expect((await outcomes).map((outcome) => outcome.status)).toEqual([
        "rejected",
        "rejected",
      ]);
      expect(
        event === "input-error" ? received.onError : received.onClose,
      ).toHaveBeenCalledOnce();
      expect(input.listenerCount("data")).toBe(0);
      expect(blocked.output.listenerCount("drain")).toBe(0);
      if (event !== "output-close") blocked.complete();
    },
  );
});

it("consumes a late failure when close happens inside an accepted write", async () => {
  let complete: (error: Error) => void = () => {
    throw new Error("No pending write");
  };
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      complete = callback;
      void transport.close();
    },
  });
  const transport = stdio({ input: new PassThrough(), output });
  await transport.start(callbacks());
  await expect(transport.send(response(1))).rejects.toThrow("closed");
  complete(new Error("late failure"));
  await vi.waitFor(() => expect(output.listenerCount("error")).toBe(0), {
    interval: 1,
  });
});

it("preserves detached calls to the public transport methods", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const { start, send, close } = stdio({ input, output });
  const received = callbacks();
  await start(received);
  input.write('{"method":"tools/list"}\n');
  expect(received.onMessage).toHaveBeenCalledExactlyOnceWith({
    method: "tools/list",
  });
  await send(response(1));
  expect(JSON.parse(output.read().toString())).toEqual(response(1));
  await close();
  expect(input.listenerCount("data")).toBe(0);
});
