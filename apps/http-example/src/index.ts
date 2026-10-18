import { createServer as createHttpServer } from "node:http";
import { createServer, tool } from "@toolgrain/mcp";
import { createNodeHttpHandler } from "@toolgrain/node";
import { z } from "zod";

const server = createServer({
  name: "hello-http",
  version: "1.0.0",
  tools: {
    greet: tool({
      title: "Greeting",
      annotations: { readOnlyHint: true, openWorldHint: false },
      description: "Greet someone by name",
      input: z.object({ name: z.string().min(1) }),
      output: z.object({ message: z.string() }),
      execute: ({ name }) => ({ message: `Hello, ${name}!` }),
    }),
  },
});
const handler = createNodeHttpHandler(server);
const http = createHttpServer((request, response) => {
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
