import { stdin, stdout } from "node:process";
import type { Readable, Writable } from "node:stream";
import type {
  JSONRPCResponse,
  Transport,
  TransportCallbacks,
} from "@toolgrain/mcp";
import { createMessageDecoder } from "./framing.js";
import { writeLine } from "./write.js";

export interface StdioOptions {
  input?: Readable;
  output?: Writable;
  /** Maximum UTF-8 bytes per incoming message, excluding its newline. Default: 1 MiB. */
  maxMessageBytes?: number;
}

/** A single-use transport; supplied streams remain owned by the caller. */
export function stdio(options: StdioOptions = {}): Transport {
  const input = options.input ?? stdin;
  const output = options.output ?? stdout;
  const maxMessageBytes = options.maxMessageBytes ?? 1024 * 1024;

  if (!Number.isSafeInteger(maxMessageBytes) || maxMessageBytes < 1)
    throw new RangeError("maxMessageBytes must be a positive safe integer");
  let state: "idle" | "open" | "closed" = "idle";
  let callbacks: TransportCallbacks | undefined;
  let decoder: ReturnType<typeof createMessageDecoder> | undefined;
  let writes = Promise.resolve();

  function detach() {
    input.off("data", data);
    input.off("end", ended);
    input.off("close", inputClosed);
    input.off("error", failed);
    output.off("close", inputClosed);
    output.off("error", failed);
    input.pause();
  }
  function stop() {
    if (state === "closed") return;
    state = "closed";
    detach();
    callbacks = undefined;
    decoder = undefined;
  }
  function failed(error: unknown) {
    const notify = callbacks;
    stop();
    notify?.onError(error);
  }
  function inputClosed() {
    const notify = callbacks;
    stop();
    notify?.onClose();
  }
  function ended() {
    try {
      decoder?.end();
    } catch (error) {
      failed(error);
      return;
    }
    inputClosed();
  }
  function data(chunk: Buffer | Uint8Array | string) {
    try {
      decoder?.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    } catch (error) {
      failed(error);
    }
  }
  return {
    async start(value) {
      if (state !== "idle")
        throw new Error("Stdio transport can only start once");
      if (
        input.destroyed ||
        input.readableEnded ||
        output.destroyed ||
        output.writableEnded
      ) {
        stop();
        throw new Error("Stdio streams are already closed");
      }
      state = "open";
      callbacks = value;
      decoder = createMessageDecoder(
        {
          ...value,
          onMessage(message) {
            if (state === "open") callbacks?.onMessage(message);
          },
          onParseError(error) {
            if (state === "open") callbacks?.onParseError(error);
          },
        },
        maxMessageBytes,
      );
      input.on("end", ended);
      input.on("close", inputClosed);
      input.on("error", failed);
      output.on("close", inputClosed);
      output.on("error", failed);
      input.on("data", data);
      input.resume();
    },
    send(message: JSONRPCResponse) {
      const write = writes.then(async () => {
        if (state !== "open") throw new Error("Stdio transport is not open");
        await writeLine(output, `${JSON.stringify(message)}\n`);
      });
      writes = write.catch(() => {
        /* Keep the write queue usable; the caller receives the rejection. */
      });
      return write;
    },
    async close() {
      stop();
    },
  };
}
