import { createServer, tool } from "@toolgrain/mcp";
import { stdio } from "@toolgrain/node";
import { z } from "zod";

const server = createServer({
  name: "toolgrain-stdio-example",
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
  onError(error) {
    console.error(error);
  },
});
await server.listen(stdio());
