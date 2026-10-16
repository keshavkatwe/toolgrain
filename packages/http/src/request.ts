import {
  INVALID_REQUEST,
  LEGACY_PROTOCOL_VERSION,
  PARSE_ERROR,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { type BodyError, readBody } from "./body.js";
import { isLegacyNotification } from "./legacy-notification.js";
import { type ObjectValue, object } from "./object.js";
import type { ParameterHeaders } from "./parameter-headers.js";
import { selectProtocol } from "./protocol-version.js";
import { errorResponse } from "./responses.js";

type RequestResult =
  | {
      ok: true;
      message: ObjectValue;
      protocolVersion: SupportedProtocolVersion;
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
  const errorVersion =
    request.headers.get("MCP-Protocol-Version") === LEGACY_PROTOCOL_VERSION
      ? LEGACY_PROTOCOL_VERSION
      : undefined;
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
      undefined,
      undefined,
      errorVersion,
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
      body,
      undefined,
      errorVersion,
    );
  const selected = selectProtocol(request.headers, body, parameters);
  if (!selected.ok) return selected;
  if (
    !Object.hasOwn(body, "id") &&
    (selected.protocolVersion !== LEGACY_PROTOCOL_VERSION ||
      !isLegacyNotification(body))
  )
    return reject(
      400,
      INVALID_REQUEST,
      "Unsupported or malformed notification",
      body,
      undefined,
      selected.protocolVersion,
    );
  return { ok: true, message: body, protocolVersion: selected.protocolVersion };
}
