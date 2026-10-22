#!/usr/bin/env bun
// Commands load on demand, so ci-report (which must work without installed
// dependencies) and verify-inspector (which checks Node) can run under Node.
const commands = {
  size: [
    "./package-size.mjs",
    "Check this package's tarball against its size budget",
  ],
  exports: [
    "./package-exports.mjs",
    "Lint this package's exports with publint and attw",
  ],
  "mcp-compat": [
    "./mcp-compatibility.mjs",
    "Check MCP consumers with minimum and development TypeScript/Zod versions",
  ],
  "clean-install": [
    "./clean-install.mjs",
    "Install packed libraries; check Node/Bun runtimes and minimum/current types",
  ],
  "support-matrix": [
    "./support-matrix.mjs",
    "Resolve weekly compiler checks or prepare CI-only dependency drift probes",
  ],
  audit: ["./audit.mjs", "Audit the Bun lockfile and write reports/audit.json"],
  "ci-report": [
    "./ci-report.mjs",
    "Render the CI summary and pull request report",
  ],
  "inspect-http": [
    "./inspect-http.mjs",
    "Open MCP Inspector for an HTTP endpoint",
  ],
  "verify-inspector": [
    "./verify-inspector.mjs",
    "Verify the examples with the Inspector CLI",
  ],
};

const [name, ...args] = process.argv.slice(2);
if (name === undefined || !Object.hasOwn(commands, name)) {
  const width = Math.max(...Object.keys(commands).map((key) => key.length));
  const usage = Object.entries(commands)
    .map(([key, [, summary]]) => `  ${key.padEnd(width)}  ${summary}`)
    .join("\n");
  const help = name === "help" || name === "--help";
  (help ? console.log : console.error)(
    `${help || name === undefined ? "" : `Unknown command: ${name}\n\n`}Usage: toolgrain-repo <command> [args]\n\nCommands:\n${usage}`,
  );
  if (!help) process.exitCode = 1;
} else {
  const { main } = await import(commands[name][0]);
  await main(args);
}
