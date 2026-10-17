import { LEGACY_PROTOCOL_VERSION } from "@toolgrain/protocol";
import type { HttpProtocol } from "./http-protocol.js";
import { isInitializationProposal } from "./legacy/headers.js";
import { legacyHttp } from "./legacy/http.js";
import { modernHttp } from "./modern/http.js";
import type { ObjectValue } from "./object.js";
import type { ParameterHeaders } from "./parameter-headers.js";
import { errorResponse } from "./responses.js";

type ProtocolSelection =
  | { ok: true; protocol: HttpProtocol }
  | { ok: false; response: Response };

/** Before decoding, only an explicit legacy header changes error-ID semantics. */
export function protocolForErrors(headers: Headers): HttpProtocol {
  return headers.get("MCP-Protocol-Version") === LEGACY_PROTOCOL_VERSION
    ? legacyHttp
    : modernHttp;
}

/** Select once per POST; initialization never changes another client's era. */
export function selectProtocol(
  headers: Headers,
  body: ObjectValue,
  parameters: ParameterHeaders,
): ProtocolSelection {
  const version = headers.get("MCP-Protocol-Version");
  const protocol =
    version === LEGACY_PROTOCOL_VERSION ||
    (version === null && isInitializationProposal(body))
      ? legacyHttp
      : modernHttp;
  const failure = protocol.validateRequest(headers, body, parameters);
  if (failure)
    return {
      ok: false,
      response: errorResponse(
        400,
        failure.code,
        failure.message,
        protocol.errorId(body),
        failure.data,
      ),
    };
  return { ok: true, protocol };
}
