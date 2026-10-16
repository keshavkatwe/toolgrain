import { LATEST_PROTOCOL_VERSION as LEGACY_PROTOCOL_VERSION } from "./vendor/2025-06-18/schema.js";
import { LATEST_PROTOCOL_VERSION } from "./vendor/2026-07-28/schema.js";

export type {
  LegacyJSONRPCErrorResponse,
  ProtocolResponse,
} from "./responses.js";
export * from "./vendor/2026-07-28/schema.js";
export { LATEST_PROTOCOL_VERSION as PROTOCOL_VERSION } from "./vendor/2026-07-28/schema.js";
export { LEGACY_PROTOCOL_VERSION };

export const SUPPORTED_PROTOCOL_VERSIONS = [
  LATEST_PROTOCOL_VERSION,
  LEGACY_PROTOCOL_VERSION,
] as const;

export type SupportedProtocolVersion =
  (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];
