import { spawnSync } from "node:child_process";

for (const entry of ["weather", "sales", "shared"]) {
  const child = spawnSync(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "build", "--mode", entry],
    { stdio: "inherit" },
  );
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}
