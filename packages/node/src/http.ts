import {
  createHttpHandler,
  createProtectedResourceMetadataHandler,
  type HttpOptions,
} from "@toolgrain/http";
import type { Server } from "@toolgrain/mcp";
import { nodeHttpHandler } from "./http-handler.js";

/** Mount at the root before body parsing. Delegates unmatched paths when next is supplied. */
export function createNodeHttpHandler(server: Server, options?: HttpOptions) {
  const handle = createHttpHandler(server, options);
  return nodeHttpHandler(handle, handle.matches);
}

export function createNodeProtectedResourceMetadataHandler(
  server: Server,
  options?: Pick<HttpOptions, "allowedHosts">,
) {
  return nodeHttpHandler(
    createProtectedResourceMetadataHandler(server, options),
  );
}
