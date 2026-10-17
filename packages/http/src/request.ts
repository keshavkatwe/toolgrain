import { INVALID_REQUEST, PARSE_ERROR } from "@toolgrain/protocol";
import { type BodyError, readBody } from "./body.js";
import type { HttpProtocol } from "./http-protocol.js";
import { type ObjectValue, object } from "./object.js";
import type { ParameterHeaders } from "./parameter-headers.js";
import { protocolForErrors, selectProtocol } from "./protocol-version.js";
import { errorResponse } from "./responses.js";

type RequestResult =
  | {
      ok: true;
      message: ObjectValue;
      protocol: HttpProtocol;
    }
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
      protocolForErrors(request.headers).errorId(),
    );
  }
  const body = object(incoming);
  if (
    body?.jsonrpc !== "2.0" ||
    typeof body.method !== "string" ||
    Object.hasOwn(body, "result") ||
    Object.hasOwn(body, "error") ||
    (Object.hasOwn(body, "params") && !object(body.params)) ||
    (Object.hasOwn(body, "id") &&
      typeof body.id !== "number" &&
      typeof body.id !== "string") ||
    (typeof body.id === "number" &&
      (!Number.isFinite(body.id) || !Number.isInteger(body.id)))
  )
    return reject(
      400,
      INVALID_REQUEST,
      "Invalid request",
      protocolForErrors(request.headers).errorId(body),
    );
  const selected = selectProtocol(request.headers, body, parameters);
  if (!selected.ok) return selected;
  if (
    !Object.hasOwn(body, "id") &&
    !selected.protocol.acceptsNotification(body)
  )
    return reject(
      400,
      INVALID_REQUEST,
      "Unsupported or malformed notification",
      selected.protocol.errorId(body),
    );
  return { ok: true, message: body, protocol: selected.protocol };
}
