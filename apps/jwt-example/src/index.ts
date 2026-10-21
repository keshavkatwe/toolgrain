import { http } from "@toolgrain/node";
import { server } from "./server.js";

const transport = http({ port: Number(process.env.PORT ?? 3006) });
await server.listen(transport);
console.error(
  `MCP endpoint: http://127.0.0.1:${transport.address()?.port}/mcp`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void server.close();
  });
