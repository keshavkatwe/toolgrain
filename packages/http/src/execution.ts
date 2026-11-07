import type { AuthScope, Server } from "@toolgrain/mcp";
import type { HttpProtocol } from "./http-protocol.js";
import { type ObjectValue, object } from "./object.js";
import { protocolResponse, unavailableResponse } from "./responses.js";
import { executeStreamingRequest } from "./stream.js";

export async function executeHttpRequest(
  server: Server,
  message: ObjectValue,
  signal: AbortSignal,
  protocol: HttpProtocol,
  auth?: AuthScope,
): Promise<Response> {
  if (
    message.method === "tools/call" &&
    Object.hasOwn(message, "id") &&
    object(object(message.params)?._meta)?.progressToken !== undefined
  )
    return executeStreamingRequest(server, message, signal, protocol, auth);
  try {
    const response = await server.handle(message, {
      signal,
      protocolVersion: protocol.protocolVersion,
      ...(auth ? { auth } : {}),
    });
    if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
    if (!response && !Object.hasOwn(message, "id"))
      return new Response(null, { status: 202 });
    if (!response) return unavailableResponse(message, protocol);
    return protocolResponse(response, protocol);
  } catch (failure) {
    if (signal.aborted) throw failure;
    return unavailableResponse(message, protocol);
  } finally {
    auth?.dispose();
  }
}
