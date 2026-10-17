import {
  INTERNAL_ERROR,
  type ProtocolResponse,
  type RequestId,
} from "@toolgrain/protocol";
import type { ErrorId, HttpProtocol } from "./http-protocol.js";
import type { ObjectValue } from "./object.js";

/** A valid request ID can be echoed in either era. */
export function responseId(body?: ObjectValue): RequestId | undefined {
  const id = body?.id;
  if (
    typeof id === "string" ||
    (typeof id === "number" && Number.isFinite(id) && Number.isInteger(id))
  )
    return id;
}

export const errorResponse = (
  status: number,
  code: number,
  message: string,
  id: ErrorId = {},
  data?: unknown,
) =>
  Response.json(
    {
      jsonrpc: "2.0",
      ...id,
      error: { code, message, ...(data === undefined ? {} : { data }) },
    },
    { status },
  );

export function unavailableResponse(body: ObjectValue, protocol: HttpProtocol) {
  return errorResponse(
    503,
    INTERNAL_ERROR,
    "Server unavailable",
    protocol.errorId(body),
  );
}

export function protocolResponse(
  response: ProtocolResponse,
  protocol: HttpProtocol,
): Response {
  return Response.json(response, { status: protocol.responseStatus(response) });
}
