import {
  HEADER_MISMATCH,
  INVALID_REQUEST,
  PARSE_ERROR,
  PROTOCOL_VERSION,
  UNSUPPORTED_PROTOCOL_VERSION,
} from "@toolgrain/protocol";
import { type BodyError, readBody } from "./body.js";
import { validateHeaders } from "./headers.js";
import { type ObjectValue, object } from "./object.js";
import type { ParameterHeaders } from "./parameter-headers.js";
import { errorResponse } from "./responses.js";

type RequestResult =
  | { ok: true; message: ObjectValue }
  | { ok: false; response: Response };
const reject = (...args: Parameters<typeof errorResponse>): RequestResult => ({
  ok: false,
  response: errorResponse(...args),
});

export async function readRequest(
  request: Request,
  maxMessageBytes: number,
  parameters: ParameterHeaders,
): Promise<RequestResult> {
  let incoming: unknown;
  try {
    incoming = await readBody(request, maxMessageBytes);
  } catch (failure) {
    if (request.signal.aborted) throw failure;
    const value = failure as BodyError;
    return reject(
      value.status,
      value.status === 413 ? INVALID_REQUEST : PARSE_ERROR,
      value.message,
    );
  }
  const body = object(incoming);
  if (
    body?.jsonrpc !== "2.0" ||
    typeof body.method !== "string" ||
    (Object.hasOwn(body, "id") &&
      typeof body.id !== "number" &&
      typeof body.id !== "string") ||
    (typeof body.id === "number" && !Number.isFinite(body.id))
  )
    return reject(400, INVALID_REQUEST, "Invalid request", body);
  // No client-to-server notifications are implemented for this protocol binding.
  if (!Object.hasOwn(body, "id"))
    return reject(400, INVALID_REQUEST, "Unsupported notification");
  try {
    validateHeaders(request.headers, body, parameters);
  } catch (failure) {
    return reject(400, HEADER_MISMATCH, (failure as Error).message, body);
  }
  if (request.headers.get("MCP-Protocol-Version") !== PROTOCOL_VERSION)
    return reject(
      400,
      UNSUPPORTED_PROTOCOL_VERSION,
      "Unsupported protocol version",
      body,
      {
        supported: [PROTOCOL_VERSION],
        requested: request.headers.get("MCP-Protocol-Version"),
      },
    );
  return { ok: true, message: body };
}
