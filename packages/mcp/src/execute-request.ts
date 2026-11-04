import {
  INTERNAL_ERROR,
  type ProtocolResponse,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { type ErrorHandler, reportError } from "./diagnostics.js";
import type { Dispatcher, RequestScope } from "./dispatcher.js";
import type { Request } from "./protocol/messages.js";
import { ProtocolError, protocolError } from "./protocol/responses.js";
import { createProgressReporter } from "./tools/progress.js";

/** Shared dispatch boundary for connection-scoped and independent requests. */
export async function executeRequest(
  dispatch: Dispatcher,
  request: Request,
  scope: RequestScope,
  onError?: ErrorHandler,
  protocolVersion?: SupportedProtocolVersion,
): Promise<ProtocolResponse | undefined> {
  const isActive = () => !scope.signal.aborted;
  let progress: ReturnType<typeof createProgressReporter> | undefined;
  try {
    progress = createProgressReporter(
      scope.signal,
      (request.params?._meta as Record<string, unknown> | undefined)
        ?.progressToken,
      scope.notify,
    );
    const response = await dispatch(
      request,
      { ...scope, reportProgress: progress.report },
      protocolVersion,
    );
    await progress.finish();
    return isActive() ? response : undefined;
  } catch (error) {
    if (!isActive()) return;
    if (error instanceof ProtocolError)
      return protocolError(error.code, error.message, request.id, error.data);
    reportError(onError, error);
    return protocolError(
      INTERNAL_ERROR,
      "Internal error",
      request.id,
      undefined,
    );
  } finally {
    progress?.close();
  }
}
