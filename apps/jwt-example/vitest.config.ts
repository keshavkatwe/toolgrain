import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each Turbo process owns its module cache; the workspace-root default races.
    fsModuleCachePath: "node_modules/.vitest-cache",
    // Names each workspace's section in the GitHub Actions job summary.
    name: "@toolgrain/jwt-example",
  },
});
