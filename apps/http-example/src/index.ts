import { createServer } from "node:http";
import { createNodeHttpHandler } from "@toolgrain/node";
import { exampleServer } from "./server.js";

const server = exampleServer();
const handler = createNodeHttpHandler(server);
const http = createServer((request, response) => {
  if (request.url?.split("?")[0] !== "/mcp") {
    response.writeHead(404).end();
    return;
  }
  void handler(request, response);
});
http.listen(Number(process.env.PORT ?? 3000), "127.0.0.1", () =>
  console.error("MCP endpoint: http://127.0.0.1:3000/mcp"),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void server.close();
    http.close();
    http.closeAllConnections();
  });
