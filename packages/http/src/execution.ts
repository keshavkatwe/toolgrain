import type { Server } from "@toolgrain/mcp";
import type { ObjectValue } from "./object.js";
import { protocolResponse, unavailableResponse } from "./responses.js";

export async function executeHttpRequest(
  server: Server,
  message: ObjectValue,
  signal: AbortSignal,
): Promise<Response> {
  try {
    const response = await server.handle(message, { signal });
    if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
    if (!response) return unavailableResponse(message);
    return protocolResponse(response);
  } catch (failure) {
    if (signal.aborted) throw failure;
    return unavailableResponse(message);
  }
}
