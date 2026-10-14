import type {
  Implementation,
  JSONRPCErrorResponse,
  JSONRPCResultResponse,
  RequestId,
  Result,
} from "../vendor/schema.js";
import { JSONRPC_VERSION } from "../vendor/schema.js";

export function protocolError(
  code: number,
  message: string,
  id?: RequestId,
  data?: unknown,
): JSONRPCErrorResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    ...(id === undefined ? {} : { id }),
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
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
