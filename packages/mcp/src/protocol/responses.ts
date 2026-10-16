import type {
  Implementation,
  JSONRPCErrorResponse,
  JSONRPCResultResponse,
  LegacyJSONRPCErrorResponse,
  ProtocolResponse,
  RequestId,
  Result,
} from "@toolgrain/protocol";
import { JSONRPC_VERSION } from "@toolgrain/protocol";

export function protocolError(
  code: number,
  message: string,
  id?: RequestId,
  data?: unknown,
  legacy?: boolean,
): JSONRPCErrorResponse | LegacyJSONRPCErrorResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    ...(id === undefined ? (legacy ? { id: null } : {}) : { id }),
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

export function legacyResponse(
  id: RequestId,
  result: Record<string, unknown>,
): ProtocolResponse {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

export function successResponse(
  id: RequestId,
  result: Result,
  identity: Implementation,
): JSONRPCResultResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result: {
      ...result,
      _meta: {
        ...result._meta,
        "io.modelcontextprotocol/serverInfo": identity,
      },
    },
  };
}

/** An internal dispatch failure, converted to a protocol response at the connection boundary. */
export class ProtocolError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "ProtocolError";
  }
}
