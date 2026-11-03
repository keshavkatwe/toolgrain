import type { ProgressNotification, ProgressToken } from "@toolgrain/protocol";
import { z } from "zod";
import { abortable } from "../abort.js";

/** One progress update; values are finite numbers and progress must strictly increase. */
export interface ToolProgress {
  /** Work completed so far, in application-defined units; the first value may be zero. */
  readonly progress: number;
  /** Optional total work, in the same units; omit when unknown. */
  readonly total?: number;
  /** Optional public status message sent to the client. */
  readonly message?: string;
}

const update = z.object({
  progress: z.number().finite(),
  total: z.number().finite().optional(),
  message: z.string().optional(),
});

/** One invocation owns its reporter, ordering, and completion boundary. */
export function createProgressReporter(
  signal: AbortSignal,
  token: unknown,
  send?: (message: ProgressNotification) => void | Promise<void>,
) {
  const validToken =
    typeof token === "string" ||
    (typeof token === "number" &&
      Number.isFinite(token) &&
      Number.isInteger(token));
  let open = true;
  let previous = Number.NEGATIVE_INFINITY;
  let writes = Promise.resolve();
  const report = (value: ToolProgress): Promise<void> => {
    if (!open || signal.aborted || !validToken || !send)
      return Promise.resolve();
    const parsed = update.safeParse(value);
    if (!parsed.success)
      return Promise.reject(new TypeError("Invalid progress update"));
    if (parsed.data.progress <= previous)
      return Promise.reject(new TypeError("Progress must strictly increase"));
    previous = parsed.data.progress;
    const message: ProgressNotification = {
      jsonrpc: "2.0",
      method: "notifications/progress",
      params: {
        progress: parsed.data.progress,
        ...(parsed.data.total === undefined
          ? {}
          : { total: parsed.data.total }),
        ...(parsed.data.message === undefined
          ? {}
          : { message: parsed.data.message }),
        progressToken: token as ProgressToken,
      },
    };
    const write = writes.then(async () => {
      if (!signal.aborted)
        await abortable(
          Promise.resolve().then(() => {
            if (!signal.aborted) return send(message);
          }),
          signal,
        );
    });
    // The awaiting handler observes failures; keep the queue usable for cleanup.
    writes = write.catch(() => {});
    return write;
  };
  return {
    report,
    async finish() {
      open = false;
      await writes;
    },
    close() {
      open = false;
    },
  };
}
