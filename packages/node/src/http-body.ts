import type { IncomingMessage } from "node:http";

/** Cancelling body consumption must not destroy the socket before an error response is sent. */
export function requestBody(
  input: IncomingMessage,
): ReadableStream<Uint8Array> {
  let detach: () => void;
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        const data = (chunk: Buffer) => {
          controller.enqueue(chunk);
          input.pause();
        };
        const end = () => {
          detach();
          controller.close();
        };
        const error = (failure: Error) => {
          detach();
          controller.error(failure);
        };
        const aborted = () => error(new Error("Request aborted"));
        detach = () => {
          input.off("data", data);
          input.off("end", end);
          input.off("error", error);
          input.off("aborted", aborted);
          input.pause();
        };
        input.on("data", data);
        input.once("end", end);
        input.once("error", error);
        input.once("aborted", aborted);
      },
      pull() {
        input.resume();
      },
      cancel() {
        detach();
      },
    },
    { highWaterMark: 0 },
  );
}
