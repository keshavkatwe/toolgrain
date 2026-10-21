import {
  createHttpHandler,
  createProtectedResourceMetadataHandler,
  type HttpOptions,
} from "@toolgrain/http";
import type { Server } from "@toolgrain/mcp";
import { nodeHttpHandler } from "./http-handler.js";

/** Mount before body parsing middleware. Does not own or close the HTTP listener. */
export function createNodeHttpHandler(server: Server, options?: HttpOptions) {
  return nodeHttpHandler(createHttpHandler(server, options));
}

export function createNodeProtectedResourceMetadataHandler(server: Server) {
  return nodeHttpHandler(createProtectedResourceMetadataHandler(server));
}
