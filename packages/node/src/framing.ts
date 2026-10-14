import type { TransportCallbacks } from "@toolgrain/mcp";

/** Collects byte fragments until a newline, then decodes one UTF-8 JSON message. */
export function createMessageDecoder(
  callbacks: TransportCallbacks,
  maxMessageBytes: number,
) {
  let fragments: Buffer[] = [];
  let size = 0;
  const utf8 = new TextDecoder("utf-8", { fatal: true });

  function append(fragment: Buffer) {
    size += fragment.length;
    if (size > maxMessageBytes)
      throw new Error(`MCP message exceeds ${maxMessageBytes} bytes`);
    if (fragment.length) fragments.push(fragment);
  }
  function message() {
    const bytes = Buffer.concat(fragments, size);
    fragments = [];
    size = 0;
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
        message();
        start = newline + 1;
      }
    },
    end() {
      if (size)
        callbacks.onParseError(
          new SyntaxError("Unterminated MCP message at end of input"),
        );
      fragments = [];
      size = 0;
    },
  };
}
