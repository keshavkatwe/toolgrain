import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Use this package's pinned binaries regardless of the caller's PATH.
const bin = (name) =>
  fileURLToPath(new URL(`../node_modules/.bin/${name}`, import.meta.url));

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

/** Lint the current package's exports as consumers would resolve them. */
export function main() {
  const linted = run(bin("publint"), ["--strict"]);
  if (linted !== 0) {
    process.exitCode = linted;
    return;
  }
  // npm pack refuses this repository's Bun devEngines, so attw checks a Bun archive.
  const destination = mkdtempSync(join(tmpdir(), "toolgrain-attw-"));
  try {
    const archivePath = join(destination, "package.tgz");
    const packed = run("bun", [
      "pm",
      "pack",
      "--ignore-scripts",
      "--quiet",
      "--filename",
      archivePath,
    ]);
    if (packed !== 0) throw new Error("Packing failed");
    // Packages are ESM-only; CommonJS and node10 resolution are intentionally unsupported.
    process.exitCode = run(bin("attw"), [
      archivePath,
      "--profile",
      "esm-only",
      "--no-emoji",
    ]);
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
}
