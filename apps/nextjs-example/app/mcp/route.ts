import { createHttpHandler } from "@toolgrain/http";
import { createServer, tool } from "@toolgrain/mcp";
import { z } from "zod";

const handler = createHttpHandler(
  createServer({
    name: "hello-next",
    version: "1.0.0",
    tools: {
      greet: tool({
        title: "Greeting",
        annotations: { readOnlyHint: true, openWorldHint: false },
        input: z.object({ name: z.string() }),
        output: z.object({ message: z.string() }),
        execute: ({ name }) => ({ message: `Hello, ${name}!` }),
      }),
    },
  }),
);
export const POST = handler;
export const GET = handler;
export const DELETE = handler;
export const runtime = "nodejs";
