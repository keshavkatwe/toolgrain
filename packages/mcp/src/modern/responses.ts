import type {
  Implementation,
  JSONRPCResultResponse,
  RequestId,
  Result,
} from "@toolgrain/protocol";
import { JSONRPC_VERSION } from "@toolgrain/protocol";

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
        "io.modelcontextprotocol/serverInfo": { ...identity },
      },
    },
  };
}
