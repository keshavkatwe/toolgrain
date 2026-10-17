import {
  INVALID_PARAMS,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import type { Request } from "./messages.js";
import { ProtocolError } from "./responses.js";

export function hasProtocolVersionMetadata(request: Request): boolean {
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
    hasProtocolVersionMetadata(request) &&
    meta["io.modelcontextprotocol/protocolVersion"] === version
  );
}

/** A transport-selected revision cannot contradict an explicit request revision. */
export function validateVersionContext(
  request: Request,
  version?: SupportedProtocolVersion,
): void {
  if (
    version !== undefined &&
    hasProtocolVersionMetadata(request) &&
    !metadataMatchesVersion(request, version)
  )
    throw new ProtocolError(
      INVALID_PARAMS,
      "Protocol version does not match request metadata",
    );
}
