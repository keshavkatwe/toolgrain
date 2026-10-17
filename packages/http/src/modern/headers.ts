import {
  HEADER_MISMATCH,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  UNSUPPORTED_PROTOCOL_VERSION,
} from "@toolgrain/protocol";
import { validateRoutingHeaders } from "../headers.js";
import type { HeaderFailure } from "../http-protocol.js";
import { type ObjectValue, object } from "../object.js";
import type { ParameterHeaders } from "../parameter-headers.js";

export function validateHeaders(
  headers: Headers,
  body: ObjectValue,
  parameters: ParameterHeaders,
) {
  const meta = object(object(body.params)?._meta);
  if (
    headers.get("MCP-Protocol-Version") !==
      meta?.["io.modelcontextprotocol/protocolVersion"] ||
    !headers.has("MCP-Protocol-Version")
  )
    throw new Error("Missing or mismatched protocol version header");
  validateRoutingHeaders(headers, body, parameters, true);
}

export function validateRequest(
  headers: Headers,
  body: ObjectValue,
  parameters: ParameterHeaders,
): HeaderFailure | undefined {
  const version = headers.get("MCP-Protocol-Version");
  const meta = object(object(body.params)?._meta);
  const metadataClaim =
    !!meta && Object.hasOwn(meta, "io.modelcontextprotocol/protocolVersion");
  const routingClaim = Array.from(headers.keys()).some(
    (key) =>
      key === "mcp-method" ||
      key === "mcp-name" ||
      key.startsWith("mcp-param-"),
  );
  // Validate contradictory routing metadata before reporting an unsupported version.
  if (
    version === PROTOCOL_VERSION ||
    metadataClaim ||
    routingClaim ||
    version === null
  ) {
    try {
      validateHeaders(headers, body, parameters);
    } catch (failure) {
      return { code: HEADER_MISMATCH, message: (failure as Error).message };
    }
  }
  if (version !== PROTOCOL_VERSION)
    return {
      code: UNSUPPORTED_PROTOCOL_VERSION,
      message: "Unsupported protocol version",
      data: { supported: [...SUPPORTED_PROTOCOL_VERSIONS], requested: version },
    };
}
