import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Names each workspace's section in the GitHub Actions job summary.
    name: "@toolgrain/elysia-example",
  },
});
