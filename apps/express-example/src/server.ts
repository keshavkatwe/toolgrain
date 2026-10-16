import { tool } from "@toolgrain/core";
import { createServer } from "@toolgrain/mcp";
import { z } from "zod";
export function exampleServer() {
  return createServer({
    name: "hello-http",
    version: "1.0.0",
    tools: {
      greet: tool({
        description: "Greet someone by name",
        input: z.object({ name: z.string().min(1) }),
        execute: ({ name }) => ({ message: `Hello, ${name}!` }),
      }),
    },
  });
}
