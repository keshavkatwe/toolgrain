import { stdin, stdout } from "node:process";
import type { Readable, Writable } from "node:stream";
import type { Transport, TransportCallbacks } from "@toolgrain/mcp";
import type { ProtocolResponse } from "@toolgrain/protocol";
import { createMessageDecoder } from "./framing.js";
import { writeLine } from "./write.js";

/** Streams and framing limit for a single-use, newline-delimited JSON transport. */
export interface StdioOptions {
  /** Incoming UTF-8 JSON stream; defaults to process stdin and remains application-owned. */
  input?: Readable;
  /** Outgoing MCP response stream; defaults to process stdout and must not contain application logs. */
  output?: Writable;
  /** Maximum UTF-8 bytes per incoming message, excluding its newline. Default: 1 MiB. */
  maxMessageBytes?: number;
}

/**
 * Create a single-use stdio transport with newline framing and write backpressure.
 * Attach it through `server.listen()`. Closing detaches listeners and pauses input;
 * supplied streams remain application-owned and are not ended or destroyed.
 *
 * @param options - Input/output streams and a positive incoming-message byte limit.
 * @returns A transport that can be attached once and cannot restart after closing.
 * @throws `RangeError` if `maxMessageBytes` is not a positive safe integer.
 */
export function stdio(options: StdioOptions = {}): Transport {
  return new StdioTransport(options);
}

class StdioTransport implements Transport {
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly maxMessageBytes: number;
  private readonly writeCancellation = new AbortController();
  private state: "idle" | "open" | "closed" = "idle";
  private callbacks: TransportCallbacks | undefined;
  private decoder: ReturnType<typeof createMessageDecoder> | undefined;
  private writes = Promise.resolve();

  constructor(options: StdioOptions) {
    this.input = options.input ?? stdin;
    this.output = options.output ?? stdout;
    this.maxMessageBytes = options.maxMessageBytes ?? 1024 * 1024;

    if (!Number.isSafeInteger(this.maxMessageBytes) || this.maxMessageBytes < 1)
      throw new RangeError("maxMessageBytes must be a positive safe integer");
  }

  // Arrow methods preserve detached calls supported by the factory's original API.
  readonly start = async (
    transportCallbacks: TransportCallbacks,
  ): Promise<void> => {
    if (this.state !== "idle")
      throw new Error("Stdio transport can only start once");
    if (
      this.input.destroyed ||
      this.input.readableEnded ||
      this.output.destroyed ||
      this.output.writableEnded
    ) {
      this.shutdown();
      throw new Error("Stdio streams are already closed");
    }
    this.state = "open";
    this.callbacks = transportCallbacks;
    this.decoder = createMessageDecoder(
      {
        onMessage: (message) => {
          if (this.state === "open") this.callbacks?.onMessage(message);
        },
        onParseError: (error) => {
          if (this.state === "open") this.callbacks?.onParseError(error);
        },
      },
      this.maxMessageBytes,
    );
    this.input.on("end", this.onInputEnd);
    this.input.on("close", this.onStreamClose);
    this.input.on("error", this.onStreamError);
    this.output.on("close", this.onStreamClose);
    this.output.on("error", this.onStreamError);
    this.input.on("data", this.onData);
    this.input.resume();
  };

  readonly send = (message: ProtocolResponse): Promise<void> => {
    const write = this.writes.then(async () => {
      if (this.state !== "open") throw new Error("Stdio transport is not open");
      await writeLine(
        this.output,
        `${JSON.stringify(message)}\n`,
        this.writeCancellation.signal,
      );
    });
    this.writes = write.catch(() => {
      /* Keep the write queue usable; the caller receives the rejection. */
    });
    return write;
  };

  readonly close = async (): Promise<void> => {
    this.shutdown();
  };

  private shutdown(reason?: { error: unknown } | { closed: true }) {
    if (this.state === "closed") return;
    this.state = "closed";
    const notify = this.callbacks;
    this.callbacks = undefined;
    this.decoder = undefined;
    this.writeCancellation.abort(
      reason && "error" in reason
        ? reason.error
        : new Error("Stdio transport is closed"),
    );
    this.detach();
    if (reason && "error" in reason) notify?.onError(reason.error);
    else if (reason) notify?.onClose();
  }

  private detach() {
    this.input.off("data", this.onData);
    this.input.off("end", this.onInputEnd);
    this.input.off("close", this.onStreamClose);
    this.input.off("error", this.onStreamError);
    this.output.off("close", this.onStreamClose);
    this.output.off("error", this.onStreamError);
    this.input.pause();
  }

  private readonly onStreamError = (error: unknown) => {
    this.shutdown({ error });
  };

  private readonly onStreamClose = () => {
    this.shutdown({ closed: true });
  };

  private readonly onInputEnd = () => {
    try {
      this.decoder?.end();
    } catch (error) {
      this.onStreamError(error);
      return;
    }
    this.onStreamClose();
  };

  private readonly onData = (chunk: Buffer | Uint8Array | string) => {
    try {
      this.decoder?.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    } catch (error) {
      this.onStreamError(error);
    }
  };
}
