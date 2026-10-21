import type { Server } from "@toolgrain/mcp";
import { authorizeRequest } from "./auth/authorize.js";
import { createProtectedResourceMetadataHandler } from "./auth/metadata.js";
import { metadataPrefix, resourceMetadataUrl } from "./auth/resource.js";
import { validateEndpoint } from "./endpoint.js";
import { executeHttpRequest } from "./execution.js";
import { hostValidator } from "./hosts.js";
import { type HttpOptions, resolveHttpOptions } from "./options.js";
import { parameterHeaders } from "./parameter-headers.js";
import { readRequest } from "./request.js";

export interface HttpHandler {
  (request: Request): Promise<Response>;
  /** Match owned endpoint paths before passing a request to framework middleware. */
  readonly matches: (pathname: string) => boolean;
}

/** Combined MCP and public authorization metadata handler. Mount at the root. */
export function createHttpHandler(
  server: Server,
  options: HttpOptions = {},
): HttpHandler {
  const { path, maxMessageBytes, allowedOrigins } = resolveHttpOptions(options);
  const parameters = parameterHeaders(server.getToolDefinitions());
  const auth = server.getAuthMetadata();
  const validateHost = hostValidator(options.allowedHosts);
  const metadata = auth
    ? createProtectedResourceMetadataHandler(server, options)
    : undefined;
  const metadataPath = auth?.resource
    ? new URL(resourceMetadataUrl(auth.resource)).pathname
    : metadataPrefix + (path === "/" ? "" : path);
  const matches = (pathname: string) =>
    pathname === path || (metadata !== undefined && pathname === metadataPath);
  const handle = async (request: Request): Promise<Response> => {
    const hostRejection = validateHost(request);
    if (hostRejection instanceof Response) return hostRejection;
    request = hostRejection;
    const pathname = new URL(request.url).pathname;
    if (!matches(pathname)) return new Response(null, { status: 404 });
    if (metadata && pathname === metadataPath) return metadata(request);
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
  return Object.assign(handle, { matches });
}
