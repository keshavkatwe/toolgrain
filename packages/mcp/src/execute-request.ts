import {
  INTERNAL_ERROR,
  type ProtocolResponse,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import type { Dispatcher, RequestScope } from "./dispatcher.js";
import type { Request } from "./protocol/messages.js";
import { ProtocolError, protocolError } from "./protocol/responses.js";

/** Shared dispatch boundary for connection-scoped and independent requests. */
export async function executeRequest(
  dispatch: Dispatcher,
  request: Request,
  scope: RequestScope,
  onError?: (error: unknown) => void,
  protocolVersion?: SupportedProtocolVersion,
): Promise<ProtocolResponse | undefined> {
  const isActive = () => !scope.signal.aborted;
  try {
    const response = await dispatch(request, scope, protocolVersion);
    return isActive() ? response : undefined;
  } catch (error) {
    if (!isActive()) return;
    if (error instanceof ProtocolError)
      return protocolError(error.code, error.message, request.id, error.data);
    try {
      onError?.(error);
    } catch {
      /* Diagnostics cannot break delivery. */
    }
    return protocolError(
      INTERNAL_ERROR,
      "Internal error",
      request.id,
      undefined,
    );
  }
}
