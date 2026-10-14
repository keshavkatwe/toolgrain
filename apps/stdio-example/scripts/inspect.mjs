import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Run npm outside this Bun-managed workspace so devEngines doesn't reject it.
const server = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const inspector = spawn(
  "npm",
  [
    "exec",
    "--cache",
    join(tmpdir(), "toolgrain-inspector-npm-cache"),
    "--yes",
    "--package=@modelcontextprotocol/inspector@2.11.0",
    "--",
    "mcp-inspector",
    "--protocol-era",
    "modern",
    process.execPath,
    server,
  ],
  {
    cwd: tmpdir(),
    stdio: "inherit",
  },
);
inspector.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
inspector.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
