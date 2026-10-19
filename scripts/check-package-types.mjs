import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// npm pack refuses this repository's Bun devEngines, so attw checks a Bun archive.
const destination = mkdtempSync(join(tmpdir(), "toolgrain-attw-"));
try {
  const archivePath = join(destination, "package.tgz");
  const packed = spawnSync(
    "bun",
    ["pm", "pack", "--ignore-scripts", "--quiet", "--filename", archivePath],
    { stdio: "inherit", timeout: 60_000 },
  );
  if (packed.error || packed.status !== 0)
    throw packed.error ?? new Error("Packing failed");
  // Use the package's pinned binary regardless of PATH. Packages are ESM-only;
  // CommonJS and node10 resolution are intentionally unsupported.
  const checked = spawnSync(
    join("node_modules", ".bin", "attw"),
    [archivePath, "--profile", "esm-only", "--no-emoji"],
    { stdio: "inherit", timeout: 60_000 },
  );
  if (checked.error) throw checked.error;
  process.exitCode = checked.status ?? 1;
} finally {
  rmSync(destination, { recursive: true, force: true });
}
