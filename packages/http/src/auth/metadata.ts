import type { Server } from "@toolgrain/mcp";
import {
  metadataPrefix,
  requestResource,
  resourceMetadataUrl,
} from "./resource.js";

/** Mount publicly at the standard well-known route corresponding to the MCP endpoint. */
export function createProtectedResourceMetadataHandler(server: Server) {
  const metadata = server.getAuthMetadata();
  if (!metadata)
    throw new Error(
      "Protected resource metadata requires an auth-configured server",
    );
  return async (request: Request): Promise<Response> => {
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
