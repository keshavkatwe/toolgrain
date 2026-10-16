import {
  HEADER_MISMATCH,
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  type SupportedProtocolVersion,
  UNSUPPORTED_PROTOCOL_VERSION,
} from "@toolgrain/protocol";
import { validateHeaders, validateLegacyHeaders } from "./headers.js";
import { type ObjectValue, object } from "./object.js";
import type { ParameterHeaders } from "./parameter-headers.js";
import { errorResponse } from "./responses.js";

type ProtocolSelection =
  | { ok: true; protocolVersion: SupportedProtocolVersion }
  | { ok: false; response: Response };

/** Select per POST; an initialization request never changes other clients' era. */
export function selectProtocol(
  headers: Headers,
  body: ObjectValue,
  parameters: ParameterHeaders,
): ProtocolSelection {
  const version = headers.get("MCP-Protocol-Version");
  const meta = object(object(body.params)?._meta);
  const modernMetadata =
    !!meta && Object.hasOwn(meta, "io.modelcontextprotocol/protocolVersion");
  const modernHeaders = Array.from(headers.keys()).some(
    (key) =>
      key === "mcp-method" ||
      key === "mcp-name" ||
      key.startsWith("mcp-param-"),
  );
  const legacy =
    version === LEGACY_PROTOCOL_VERSION ||
    (version === null && body.method === "initialize" && !modernMetadata);
  if (legacy) {
    try {
      validateLegacyHeaders(headers, body, parameters);
    } catch (failure) {
      return {
        ok: false,
        response: errorResponse(
          400,
          HEADER_MISMATCH,
          (failure as Error).message,
          body,
          undefined,
          LEGACY_PROTOCOL_VERSION,
        ),
      };
    }
    return { ok: true, protocolVersion: LEGACY_PROTOCOL_VERSION };
  }
  // Unknown version headers are never interpreted as a legacy handshake.
  if (
    version === PROTOCOL_VERSION ||
    modernMetadata ||
    modernHeaders ||
    version === null
  ) {
    try {
      validateHeaders(headers, body, parameters);
    } catch (failure) {
      return {
        ok: false,
        response: errorResponse(
          400,
          HEADER_MISMATCH,
          (failure as Error).message,
          body,
        ),
      };
    }
  }
  if (version !== PROTOCOL_VERSION)
    return {
      ok: false,
      response: errorResponse(
        400,
        UNSUPPORTED_PROTOCOL_VERSION,
        "Unsupported protocol version",
        body,
        { supported: [...SUPPORTED_PROTOCOL_VERSIONS], requested: version },
      ),
    };
  return { ok: true, protocolVersion: PROTOCOL_VERSION };
}
