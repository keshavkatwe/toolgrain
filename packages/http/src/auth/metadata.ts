import type { Server } from "@toolgrain/mcp";
import { hostValidator } from "../hosts.js";
import type { HttpOptions } from "../options.js";
import {
  metadataPrefix,
  requestResource,
  resourceMetadataUrl,
} from "./resource.js";

/**
 * Create a public GET/HEAD handler for OAuth protected-resource metadata.
 * Mount it at the well-known route corresponding to the MCP resource path. Host
 * validation applies before metadata work, and responses use `Cache-Control: no-store`.
 *
 * @param server - Auth-configured MCP server supplying public authorization metadata.
 * @param options - Host allowlist; defaults to loopback hosts on any port.
 * @returns A Web request handler for public metadata; unmatched paths return 404.
 * @throws If the server has no auth provider or the host allowlist is invalid.
 */
export function createProtectedResourceMetadataHandler(
  server: Server,
  options: Pick<HttpOptions, "allowedHosts"> = {},
) {
  const metadata = server.getAuthMetadata();
  if (!metadata)
    throw new Error(
      "Protected resource metadata requires an auth-configured server",
    );
  const validateHost = hostValidator(options.allowedHosts);
  return async (request: Request): Promise<Response> => {
    const rejection = validateHost(request);
    if (rejection instanceof Response) return rejection;
    request = rejection;
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    const url = new URL(request.url);
    if (
      url.pathname !== metadataPrefix &&
      !url.pathname.startsWith(`${metadataPrefix}/`)
    )
      return new Response(null, { status: 404 });
    let resource: string;
    try {
      resource = requestResource(request, metadata, true);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (new URL(resourceMetadataUrl(resource)).pathname !== url.pathname)
      return new Response(null, { status: 404 });
    return new Response(
      request.method === "HEAD"
        ? null
        : JSON.stringify({
            resource,
            authorization_servers: metadata.authorizationServers,
            bearer_methods_supported: ["header"],
          }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  };
}
