import {
  INTERNAL_ERROR,
  INVALID_PARAMS,
  INVALID_REQUEST,
  LEGACY_PROTOCOL_VERSION,
  METHOD_NOT_FOUND,
  MISSING_REQUIRED_CLIENT_CAPABILITY,
  type ProtocolResponse,
  type SupportedProtocolVersion,
  UNSUPPORTED_PROTOCOL_VERSION,
} from "@toolgrain/protocol";
export const errorResponse = (
  status: number,
  code: number,
  message: string,
  body?: Record<string, unknown>,
  data?: unknown,
  protocolVersion?: SupportedProtocolVersion,
) =>
  Response.json(
    {
      jsonrpc: "2.0",
      ...(typeof body?.id === "string" ||
      (typeof body?.id === "number" &&
        Number.isFinite(body.id) &&
        Number.isInteger(body.id))
        ? { id: body.id }
        : protocolVersion === LEGACY_PROTOCOL_VERSION
          ? { id: null }
          : {}),
      error: { code, message, ...(data === undefined ? {} : { data }) },
    },
    { status },
  );

export function unavailableResponse(
  body: Record<string, unknown>,
  protocolVersion: SupportedProtocolVersion,
) {
  return errorResponse(
    503,
    INTERNAL_ERROR,
    "Server unavailable",
    body,
    undefined,
    protocolVersion,
  );
}

export function protocolResponse(
  response: ProtocolResponse,
  protocolVersion: SupportedProtocolVersion,
): Response {
  if (protocolVersion === LEGACY_PROTOCOL_VERSION)
    return Response.json(response);
  if (!("error" in response)) return Response.json(response);
  const code = response.error.code;
  const badRequest = [
    UNSUPPORTED_PROTOCOL_VERSION,
    MISSING_REQUIRED_CLIENT_CAPABILITY,
    INVALID_REQUEST,
    INVALID_PARAMS,
  ].includes(code);
  const status = code === METHOD_NOT_FOUND ? 404 : badRequest ? 400 : 200;
  return Response.json(response, { status });
}
