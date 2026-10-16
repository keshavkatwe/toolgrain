import { Writable } from "node:stream";
import { expect, it, vi } from "vitest";
import { writeLine } from "../src/write.js";

it("rejects a previously aborted write without touching the stream", async () => {
  const controller = new AbortController();
  const reason = new Error("cancelled");
  controller.abort(reason);
  const write = vi.fn();
  const output = new Writable({ write });
  await expect(writeLine(output, "line\n", controller.signal)).rejects.toBe(
    reason,
  );
  expect(output.listenerCount("error")).toBe(0);
  expect(output.writableLength).toBe(0);
  expect(write).not.toHaveBeenCalled();
});

it.each(["destroyed", "ended"] as const)(
  "rejects %s output and cleans up listeners",
  async (state) => {
    const output = new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    });
    if (state === "destroyed") output.destroy();
    else output.end();
    await expect(
      writeLine(output, "line\n", new AbortController().signal),
    ).rejects.toThrow("not writable");
    expect(output.listenerCount("error")).toBe(0);
    expect(output.listenerCount("close")).toBe(0);
    expect(output.listenerCount("drain")).toBe(0);
  },
);

it("keeps a backpressured write pending until the real stream completes it", async () => {
  let complete!: () => void;
  const chunks: string[] = [];
  const output = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, done) {
      chunks.push(chunk.toString());
      complete = done;
    },
  });
  const settled = vi.fn();
  const written = writeLine(output, "line\n", new AbortController().signal);
  void written.then(settled);
  await Promise.resolve();
  expect(chunks).toEqual(["line\n"]);
  expect(output.writableNeedDrain).toBe(true);
  expect(settled).not.toHaveBeenCalled();
  complete();
  await written;
  expect(output.writableNeedDrain).toBe(false);
  expect(settled).toHaveBeenCalledOnce();
  expect(output.listenerCount("error")).toBe(0);
  expect(output.listenerCount("close")).toBe(0);
  expect(output.listenerCount("drain")).toBe(0);
  output.end();
});
