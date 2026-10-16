import type { Writable } from "node:stream";

/** Resolves after both the write callback and any required drain event. */
export function writeLine(
  output: Writable,
  line: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    let writeCallbackComplete = false;
    let backpressureCleared = false;
    let settled = false;

    function cleanup() {
      output.off("error", onError);
      output.off("close", onClose);
      output.off("drain", onDrain);
      signal.removeEventListener("abort", onAbort);
    }
    function rejectWrite(error: unknown) {
      if (!settled) {
        settled = true;
        reject(error);
      }
    }
    function finish() {
      if (settled) {
        if (writeCallbackComplete) cleanup();
        return;
      }
      if (writeCallbackComplete && backpressureCleared) {
        settled = true;
        cleanup();
        resolve();
      }
    }
    function onError(error: Error) {
      rejectWrite(error);
      cleanup();
    }
    function onClose() {
      rejectWrite(new Error("Output stream closed during write"));
      cleanup();
    }
    function onDrain() {
      backpressureCleared = true;
      finish();
    }
    function onAbort() {
      rejectWrite(signal.reason);
      output.off("drain", onDrain);
      signal.removeEventListener("abort", onAbort);
      // Closing the transport cannot cancel a caller-owned stream's OS write.
      // Until its callback completes, retain error/close listeners to consume
      // a late write failure rather than causing an unhandled stream error.
      if (writeCallbackComplete) cleanup();
    }
    output.once("error", onError);
    output.once("close", onClose);
    output.once("drain", onDrain);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      if (output.destroyed || output.writableEnded)
        throw new Error("Output stream is not writable");
      const accepted = output.write(line, "utf8", (error) => {
        // Writable emits callback errors as events afterward. Keep onError
        // attached until that event, including when shutdown already rejected.
        if (error) return;
        writeCallbackComplete = true;
        finish();
      });
      if (accepted) {
        backpressureCleared = true;
        finish();
      }
    } catch (error) {
      rejectWrite(error);
      cleanup();
    }
  });
}
