import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Names each workspace's section in the GitHub Actions job summary.
    name: "@toolgrain/clerk",
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      include: ["src/**/*.ts"],
      reporter: ["text", "html", "lcov", "json-summary"],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
