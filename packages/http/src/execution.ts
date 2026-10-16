import type { Server } from "@toolgrain/mcp";
import type { SupportedProtocolVersion } from "@toolgrain/protocol";
import type { ObjectValue } from "./object.js";
import { protocolResponse, unavailableResponse } from "./responses.js";

export async function executeHttpRequest(
  server: Server,
  message: ObjectValue,
  signal: AbortSignal,
  protocolVersion: SupportedProtocolVersion,
): Promise<Response> {
  try {
    const response = await server.handle(message, { signal, protocolVersion });
    if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
    if (!response && !Object.hasOwn(message, "id"))
      // Cancellation is advisory: without sessions there is no safe cross-POST
      // request identity, so it must not cancel another client's matching ID.
      return new Response(null, { status: 202 });
    if (!response) return unavailableResponse(message, protocolVersion);
    return protocolResponse(response, protocolVersion);
  } catch (failure) {
    if (signal.aborted) throw failure;
    return unavailableResponse(message, protocolVersion);
  }
}
