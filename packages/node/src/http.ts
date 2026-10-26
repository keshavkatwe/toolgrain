import {
  createHttpHandler,
  createProtectedResourceMetadataHandler,
  type HttpOptions,
} from "@toolgrain/http";
import type { Server } from "@toolgrain/mcp";
import { nodeHttpHandler } from "./http-handler.js";

/**
 * Create a Node handler combining MCP and public protected-resource metadata routes.
 * Mount it at the application root before body parsing. Owned routes validate hosts
 * before authentication or body work; forwarded headers are ignored.
 *
 * @param server - Server that authorizes and dispatches each independent request.
 * @param options - Endpoint, host/origin allowlists, and request-body limit.
 * @returns An async `(input, output, next?)` handler for Node requests/responses.
 * Unmatched paths call `next()` when supplied; otherwise they return 404.
 * The application owns its listener, TLS, CORS, and trusted proxy normalization.
 * @throws For invalid HTTP configuration when constructing the handler.
 */
export function createNodeHttpHandler(server: Server, options?: HttpOptions) {
  const handle = createHttpHandler(server, options);
  return nodeHttpHandler(handle, handle.matches);
}

/**
 * Create a public GET/HEAD handler for an auth-configured server's well-known metadata route.
 * Register it separately when a framework requires explicit route registration.
 * Hosts are checked before metadata work; unmatched metadata paths return 404.
 *
 * @param server - Auth-configured MCP server whose public resource metadata is advertised.
 * @param options - Host allowlist; defaults to loopback hosts on any port.
 * @returns An async handler accepting a Node request and response; it does not own a listener.
 * @throws If authorization is not configured or the host allowlist is invalid.
 */
export function createNodeProtectedResourceMetadataHandler(
  server: Server,
  options?: Pick<HttpOptions, "allowedHosts">,
) {
  return nodeHttpHandler(
    createProtectedResourceMetadataHandler(server, options),
  );
}
