import { LATEST_PROTOCOL_VERSION as LEGACY_VERSION } from "./vendor/2025-06-18/schema.js";
import { LATEST_PROTOCOL_VERSION } from "./vendor/2026-07-28/schema.js";

export type {
  LegacyJSONRPCErrorResponse,
  ProtocolResponse,
} from "./responses.js";
export * from "./vendor/2026-07-28/schema.js";
/** Modern MCP revision used by Toolgrain for initialization-free requests: `2026-07-28`. */
export const PROTOCOL_VERSION = LATEST_PROTOCOL_VERSION;
/** Initialization-based MCP revision supported by the legacy adapter: `2025-06-18`. */
export const LEGACY_PROTOCOL_VERSION = LEGACY_VERSION;

/** Supported MCP revisions, ordered modern first and legacy second; other revisions are unsupported. */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  LATEST_PROTOCOL_VERSION,
  LEGACY_PROTOCOL_VERSION,
] as const;

/** Union of the modern and initialization-based legacy revisions supported by Toolgrain. */
export type SupportedProtocolVersion =
  (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];
