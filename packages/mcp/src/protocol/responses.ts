import type { JSONRPCErrorResponse, RequestId } from "@toolgrain/protocol";
import { JSONRPC_VERSION } from "@toolgrain/protocol";

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
