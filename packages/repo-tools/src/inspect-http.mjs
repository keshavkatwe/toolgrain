import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

/** Launch the pinned Inspector against an HTTP endpoint, with an optional URL override. */
export function main(argv) {
  const [defaultUrl, ...args] = argv;
  const endpoint = args[0]?.startsWith("http") ? args.shift() : defaultUrl;
  const url = new URL(endpoint);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Inspector requires an HTTP or HTTPS endpoint");

  // Resolve the pinned executable through Bun outside the workspace.
  // Bunx honors the Inspector's Node shebang; do not force it to run with Bun.
  const inspector = spawn(
    process.execPath,
    [
      "x",
      "--package",
      "@modelcontextprotocol/inspector@2.11.0",
      "mcp-inspector",
      "--web",
      "--protocol-era",
      "modern",
      "--transport",
      "http",
      "--server-url",
      url.href,
      ...args,
    ],
    { cwd: tmpdir(), stdio: "inherit" },
  );
  inspector.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  inspector.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
