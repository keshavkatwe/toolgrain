import assert from "node:assert/strict";
import { createRegistry, tool } from "@toolgrain/core";
import { z } from "zod";

const registry = createRegistry({
  greet: tool({
    input: z.object({ name: z.string() }),
    execute: ({ name }) => ({ message: `Hello, ${name}!` }),
  }),
});
assert.deepEqual(await registry.execute("greet", { name: "Ada" }), {
  message: "Hello, Ada!",
});
