import { createServer, tool } from "@toolgrain/mcp";
import { http } from "@toolgrain/node";
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
const transport = http({ port: Number(process.env.PORT ?? 3000) });
await server.listen(transport);
console.error(
  `MCP endpoint: http://127.0.0.1:${transport.address()?.port}/mcp`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void server.close();
  });
