import { createRegistry, tool } from "@toolgrain/core";
import { z } from "zod";

const registry = createRegistry({
  greet: tool({
    input: z.object({ name: z.string() }),
    execute: ({ name }) => ({ message: `Hello, ${name}!` }),
  }),
});
const result: { message: string } = await registry.execute("greet", {
  name: "Ada",
});
if (result.message !== "Hello, Ada!") throw new Error("Unexpected tool result");
