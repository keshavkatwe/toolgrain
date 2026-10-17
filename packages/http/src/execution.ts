import type { Server } from "@toolgrain/mcp";
import type { HttpProtocol } from "./http-protocol.js";
import type { ObjectValue } from "./object.js";
import { protocolResponse, unavailableResponse } from "./responses.js";

export async function executeHttpRequest(
  server: Server,
  message: ObjectValue,
  signal: AbortSignal,
  protocol: HttpProtocol,
): Promise<Response> {
  try {
    const response = await server.handle(message, {
      signal,
      protocolVersion: protocol.protocolVersion,
    });
    if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
    if (!response && !Object.hasOwn(message, "id"))
      return new Response(null, { status: 202 });
    if (!response) return unavailableResponse(message, protocol);
    return protocolResponse(response, protocol);
  } catch (failure) {
    if (signal.aborted) throw failure;
    return unavailableResponse(message, protocol);
  }
}
