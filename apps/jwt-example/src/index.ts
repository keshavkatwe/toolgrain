import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createNodeHttpHandler,
  createNodeProtectedResourceMetadataHandler,
} from "@toolgrain/node";
import { server } from "./server.js";

const handleMcp = createNodeHttpHandler(server);
const handleMetadata = createNodeProtectedResourceMetadataHandler(server);
const http = createHttpServer((request, response) => {
  const port = (http.address() as AddressInfo).port;
  // This example listens directly on loopback; no forwarded headers are trusted.
  if (
    request.headers.host !== `127.0.0.1:${port}` &&
    request.headers.host !== `localhost:${port}`
  ) {
    response.writeHead(400).end();
    return;
  }
  const path = request.url?.split("?")[0];
  if (path === "/mcp") void handleMcp(request, response);
  else if (path === "/.well-known/oauth-protected-resource/mcp")
    void handleMetadata(request, response);
  else response.writeHead(404).end();
});
http.listen(Number(process.env.PORT ?? 3006), "127.0.0.1", () => {
  console.error(
    `MCP endpoint: http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`,
  );
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void server.close();
    http.close();
    http.closeAllConnections();
  });
