import type { IncomingMessage } from "node:http";

export class InvalidRequestUrlError extends Error {}

/** Proxy headers require normalization by trusted application middleware. */
export function requestUrl(input: IncomingMessage): string {
  const host = input.headers.host;
  const target = input.url ?? "/";
  if (
    !host ||
    /[\s,/?#@\\]/.test(host) ||
    !target.startsWith("/") ||
    target.startsWith("//") ||
    target.includes("\\")
  )
    throw new InvalidRequestUrlError("Invalid HTTP request URL");
  const secure = "encrypted" in input.socket && input.socket.encrypted === true;
  try {
    const url = new URL(target, `${secure ? "https" : "http"}://${host}`);
    if (url.username || url.password || url.hash)
      throw new Error("Invalid URL");
    return url.href;
  } catch {
    throw new InvalidRequestUrlError("Invalid HTTP request URL");
  }
}
