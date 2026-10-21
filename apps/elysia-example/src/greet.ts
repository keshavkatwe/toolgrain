import { tool } from "@toolgrain/mcp";
import { z } from "zod";

export const greet = tool({
  title: "Greeting",
  annotations: { readOnlyHint: true, openWorldHint: false },
  description: "Greet someone by name",
  input: z.object({ name: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  execute: ({ name }) => ({ message: `Hello, ${name}!` }),
});
