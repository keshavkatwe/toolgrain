import type { TransportCallbacks } from "@toolgrain/mcp";

type DecoderCallbacks = Pick<TransportCallbacks, "onMessage" | "onParseError">;

/** Collects byte fragments until a newline, then decodes one UTF-8 JSON message. */
export function createMessageDecoder(
  callbacks: DecoderCallbacks,
  maxMessageBytes: number,
) {
  let fragments: Buffer[] = [];
  let bufferedBytes = 0;
  const utf8 = new TextDecoder("utf-8", { fatal: true });

  function append(fragment: Buffer) {
    bufferedBytes += fragment.length;
    if (bufferedBytes > maxMessageBytes)
      throw new Error(`MCP message exceeds ${maxMessageBytes} bytes`);
    if (fragment.length) fragments.push(fragment);
  }
  function resetBuffer() {
    fragments = [];
    bufferedBytes = 0;
  }
  function decodeMessage() {
    const bytes = Buffer.concat(fragments, bufferedBytes);
    resetBuffer();
    if (isBlank(bytes)) return;
    let value: unknown;
    try {
      value = JSON.parse(utf8.decode(bytes));
    } catch (error) {
      callbacks.onParseError(error);
      return;
    }
    callbacks.onMessage(value);
  }
  return {
    write(chunk: Buffer) {
      let start = 0;
      for (;;) {
        const newline = chunk.indexOf(10, start);
        if (newline < 0) {
          append(chunk.subarray(start));
          return;
        }
        append(chunk.subarray(start, newline));
        decodeMessage();
        start = newline + 1;
      }
    },
    end() {
      if (!isBlank(Buffer.concat(fragments, bufferedBytes)))
        callbacks.onParseError(
          new SyntaxError("Unterminated MCP message at end of input"),
        );
      resetBuffer();
    },
  };
}

/** Lines containing only JSON whitespace carry no message and are skipped. */
function isBlank(bytes: Buffer): boolean {
  for (const byte of bytes)
    if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0d) return false;
  return true;
}
