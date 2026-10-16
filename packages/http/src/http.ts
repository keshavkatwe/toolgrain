import type { Server } from "@toolgrain/mcp";
import { validateEndpoint } from "./endpoint.js";
import { executeHttpRequest } from "./execution.js";
import { type HttpOptions, resolveHttpOptions } from "./options.js";
import { parameterHeaders } from "./parameter-headers.js";
import { readRequest } from "./request.js";

/** Mount at one endpoint. The application owns routing, CORS, authentication and hosting. */
export function createHttpHandler(
  server: Server,
  options: HttpOptions = {},
): (request: Request) => Promise<Response> {
  const { maxMessageBytes, allowedOrigins } = resolveHttpOptions(options);
  const parameters = parameterHeaders(server.getToolDefinitions());
  return async (request) => {
    const rejection = validateEndpoint(request, allowedOrigins);
    if (rejection) return rejection;
    const parsed = await readRequest(request, maxMessageBytes, parameters);
    if (!parsed.ok) return parsed.response;
    return executeHttpRequest(server, parsed.message, request.signal);
  };
}
