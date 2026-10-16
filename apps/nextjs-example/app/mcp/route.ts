import { tool } from "@toolgrain/core";
import { createHttpHandler } from "@toolgrain/http";
import { createServer } from "@toolgrain/mcp";
import { z } from "zod";

const handler = createHttpHandler(
  createServer({
    name: "hello-next",
    version: "1.0.0",
    tools: {
      greet: tool({
        input: z.object({ name: z.string() }),
        execute: ({ name }) => ({ message: `Hello, ${name}!` }),
      }),
    },
  }),
);
export const POST = handler;
export const GET = handler;
export const DELETE = handler;
export const runtime = "nodejs";
