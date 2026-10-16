import { INVALID_REQUEST } from "@toolgrain/protocol";
import { errorResponse } from "./responses.js";

export function validateEndpoint(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
): Response | undefined {
  const origin = request.headers.get("Origin");
  if (origin !== null && !allowedOrigins.has(origin))
    return errorResponse(403, INVALID_REQUEST, "Origin not allowed");
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (
    request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    return errorResponse(415, INVALID_REQUEST, "Expected application/json");
  const accept = request.headers.get("Accept") ?? "";
  const accepted = new Set(
    accept
      .split(",")
      .filter((value) => !/;\s*q=0(?:\.0*)?(?:\s*;|\s*$)/i.test(value))
      .map((value) => value.split(";")[0]?.trim().toLowerCase()),
  );
  if (!accepted.has("application/json") || !accepted.has("text/event-stream"))
    return errorResponse(
      406,
      INVALID_REQUEST,
      "Accept must include application/json and text/event-stream",
    );
}
