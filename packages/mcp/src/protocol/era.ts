import {
  INVALID_PARAMS,
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import type { Request } from "./messages.js";
import { ProtocolError } from "./responses.js";

/** Metadata alone does not select the initialization-based protocol era. */
export function hasModernMetadata(request: Request): boolean {
  const meta = request.params?._meta;
  return (
    typeof meta === "object" &&
    meta !== null &&
    Object.hasOwn(meta, "io.modelcontextprotocol/protocolVersion")
  );
}

export function metadataMatchesVersion(
  request: Request,
  version: SupportedProtocolVersion,
): boolean {
  const meta = request.params?._meta as Record<string, unknown>;
  return (
    hasModernMetadata(request) &&
    meta["io.modelcontextprotocol/protocolVersion"] === version
  );
}

export function requestVersion(
  request: Request,
  protocolVersion?: SupportedProtocolVersion,
): SupportedProtocolVersion {
  if (hasModernMetadata(request)) {
    const meta = request.params?._meta as Record<string, unknown>;
    if (
      protocolVersion !== undefined &&
      meta["io.modelcontextprotocol/protocolVersion"] !== protocolVersion
    )
      throw new ProtocolError(
        INVALID_PARAMS,
        "Protocol version does not match request metadata",
      );
    return protocolVersion ?? PROTOCOL_VERSION;
  }
  if (request.method === "initialize")
    return protocolVersion ?? LEGACY_PROTOCOL_VERSION;
  return protocolVersion ?? PROTOCOL_VERSION;
}
