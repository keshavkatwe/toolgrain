import type { IncomingMessage } from "node:http";
import { requestBody } from "./http-body.js";

export class ConsumedRequestError extends Error {
  constructor() {
    super("Request body has already been consumed");
  }
}

function requestHeaders(input: IncomingMessage): Headers {
  const headers = new Headers();
  for (let index = 0; index < input.rawHeaders.length; index += 2) {
    headers.append(
      input.rawHeaders[index] as string,
      input.rawHeaders[index + 1] as string,
    );
  }
  return headers;
}

/** Adapt Node input to a Web Request; release body listeners even when validation rejects it. */
export async function handleNodeRequest(
  input: IncomingMessage,
  signal: AbortSignal,
  handle: (request: Request) => Promise<Response>,
): Promise<Response> {
  if (input.readableEnded || input.destroyed || input.readableEncoding)
    throw new ConsumedRequestError();
  let body: ReadableStream<Uint8Array> | undefined;
  try {
    const method = input.method ?? "GET";
    const headers = requestHeaders(input);
    body =
      method === "GET" || method === "HEAD" ? undefined : requestBody(input);
    const init: RequestInit & { duplex?: "half" } = {
      method,
      headers,
      signal,
      ...(body ? { body, duplex: "half" as const } : {}),
    };
    return await handle(new Request("http://localhost/mcp", init));
  } finally {
    await body?.cancel().catch(() => {});
  }
}
