import { once } from "node:events";
import type { ServerResponse } from "node:http";
import { ConsumedRequestError } from "./http-request.js";
import { InvalidRequestUrlError } from "./http-url.js";

async function writeBody(
  output: ServerResponse,
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
) {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || signal.aborted) break;
      if (!output.write(value)) await once(output, "drain", { signal });
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Preserve Node backpressure and close keep-alive when an incoming body was not fully read. */
export async function writeHttpResponse(
  output: ServerResponse,
  response: Response,
  signal: AbortSignal,
  inputComplete: boolean,
) {
  if (signal.aborted) return;
  if (!inputComplete) response.headers.set("Connection", "close");
  output.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) await writeBody(output, response.body, signal);
  if (signal.aborted) return;
  await finishResponse(output, signal);
}

async function finishResponse(output: ServerResponse, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      output.off("finish", finish);
      signal.removeEventListener("abort", abort);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    output.once("finish", finish);
    signal.addEventListener("abort", abort, { once: true });
    try {
      output.end();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export async function writeHttpFailure(
  output: ServerResponse,
  signal: AbortSignal,
  error: unknown,
) {
  if (signal.aborted || output.destroyed) return;
  if (output.headersSent) {
    output.destroy();
    return;
  }
  output.writeHead(
    error instanceof ConsumedRequestError ||
      error instanceof InvalidRequestUrlError
      ? 400
      : 500,
  );
  await finishResponse(output, signal).catch(() => {
    output.destroy();
  });
}
