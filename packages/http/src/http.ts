import type { Server } from "@toolgrain/mcp";
import { authorizeRequest } from "./auth/authorize.js";
import { validateEndpoint } from "./endpoint.js";
import { executeHttpRequest } from "./execution.js";
import { type HttpOptions, resolveHttpOptions } from "./options.js";
import { parameterHeaders } from "./parameter-headers.js";
import { readRequest } from "./request.js";

/** Mount at one endpoint. The application owns routing, CORS, host validation and hosting. */
export function createHttpHandler(
  server: Server,
  options: HttpOptions = {},
): (request: Request) => Promise<Response> {
  const { maxMessageBytes, allowedOrigins } = resolveHttpOptions(options);
  const parameters = parameterHeaders(server.getToolDefinitions());
  const auth = server.getAuthMetadata();
  return async (request) => {
    const rejection = validateEndpoint(request, allowedOrigins);
    if (rejection) return rejection;
    const scope = auth
      ? await authorizeRequest(server, request, auth)
      : undefined;
    if (scope instanceof Response) return scope;
    try {
      const scopedRequest = scope
        ? new Request(request, { signal: scope.signal })
        : request;
      const parsed = await readRequest(
        scopedRequest,
        maxMessageBytes,
        parameters,
      );
      if (!parsed.ok) return parsed.response;
      return await executeHttpRequest(
        server,
        parsed.message,
        request.signal,
        parsed.protocol,
        scope,
      );
    } catch (error) {
      request.signal.throwIfAborted();
      if (scope?.signal.aborted)
        return Response.json(
          { error: "temporarily_unavailable" },
          { status: 503 },
        );
      throw error;
    } finally {
      scope?.dispose();
    }
  };
}
