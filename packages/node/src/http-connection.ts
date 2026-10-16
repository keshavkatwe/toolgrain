import type { IncomingMessage, ServerResponse } from "node:http";

/** One HTTP invocation owns its abort signal and listener cleanup. */
export function watchHttpConnection(
  input: IncomingMessage,
  output: ServerResponse,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const disconnected = () => {
    if (!output.writableFinished) abort();
  };
  input.once("aborted", abort);
  input.once("error", abort);
  output.once("error", abort);
  output.once("close", disconnected);
  return {
    signal: controller.signal,
    dispose() {
      input.off("aborted", abort);
      input.off("error", abort);
      output.off("error", abort);
      output.off("close", disconnected);
    },
  };
}
