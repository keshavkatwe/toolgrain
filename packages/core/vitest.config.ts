import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["default", "json"],
    outputFile: { json: "reports/tests.json" },
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      include: ["src/**/*.ts"],
      reporter: ["text", "html", "lcov", "json-summary"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
