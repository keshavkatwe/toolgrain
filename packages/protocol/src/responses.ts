import type {
  JSONRPCError as LegacyJSONRPCError,
  JSONRPCResponse as LegacyJSONRPCResponse,
  RequestId,
} from "./vendor/2025-06-18/schema.js";
import type { JSONRPCResponse } from "./vendor/2026-07-28/schema.js";

/** JSON-RPC requires a null ID when the request ID cannot be established. */
export type LegacyJSONRPCErrorResponse = Omit<LegacyJSONRPCError, "id"> & {
  /** Original request ID, or `null` when parsing/validation could not establish one. */
  id: RequestId | null;
};

/** A response envelope in either supported MCP protocol era. */
export type ProtocolResponse =
  | JSONRPCResponse
  | LegacyJSONRPCResponse
  | LegacyJSONRPCErrorResponse;
