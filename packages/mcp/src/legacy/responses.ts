import {
  JSONRPC_VERSION,
  type JSONRPCErrorResponse,
  type LegacyJSONRPCErrorResponse,
  type RequestId,
} from "@toolgrain/protocol";
import type { JSONRPCResponse, Result } from "@toolgrain/protocol/2025-06-18";

export function successResponse(
  id: RequestId,
  result: Result,
): JSONRPCResponse {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

export function errorResponse(
  response: JSONRPCErrorResponse,
): LegacyJSONRPCErrorResponse {
  return { ...response, id: response.id ?? null };
}
