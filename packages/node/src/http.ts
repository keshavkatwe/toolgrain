import {
  createHttpHandler,
  createProtectedResourceMetadataHandler,
  type HttpOptions,
} from "@toolgrain/http";
import type { Server } from "@toolgrain/mcp";
import { nodeHttpHandler } from "./http-handler.js";

/** Mount at the root before body parsing. Does not own the HTTP listener. */
export function createNodeHttpHandler(server: Server, options?: HttpOptions) {
  return nodeHttpHandler(createHttpHandler(server, options));
}

export function createNodeProtectedResourceMetadataHandler(
  server: Server,
  options?: Pick<HttpOptions, "allowedHosts">,
) {
  return nodeHttpHandler(
    createProtectedResourceMetadataHandler(server, options),
  );
}
