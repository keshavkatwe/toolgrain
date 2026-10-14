import type { Writable } from "node:stream";

/** Resolves after the write callback and, when necessary, the drain event. */
export function writeLine(output: Writable, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let completed = false;
    let drained = false;
    let settled = false;
    function cleanup() {
      output.off("error", fail);
      output.off("close", closed);
      output.off("drain", drain);
    }
    function fail(error: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }
    function finish() {
      if (!settled && completed && drained) {
        settled = true;
        cleanup();
        resolve();
      }
    }
    function closed() {
      fail(new Error("Output stream closed during write"));
    }
    function drain() {
      drained = true;
      finish();
    }
    output.once("error", fail);
    output.once("close", closed);
    output.once("drain", drain);
    try {
      if (output.destroyed || output.writableEnded)
        throw new Error("Output stream is not writable");
      const accepted = output.write(line, "utf8", (error) => {
        // Writable emits the error after its callback; retain the error listener until then.
        if (error) return;
        completed = true;
        finish();
      });
      if (accepted) {
        drained = true;
        finish();
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error("Output write failed"));
    }
  });
}
