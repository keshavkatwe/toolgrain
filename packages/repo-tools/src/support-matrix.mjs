import assert from "node:assert/strict";
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));
const compare = (a, b) => {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
};

/** Choose released compilers only, bounded by the approved minimum/development version. */
export function compilerVersions(versions, minimum, development) {
  const minors = new Map();
  const [lastMajor, lastMinor] = development.split(".").map(Number);
  for (const version of versions
    .filter((value) => /^\d+\.\d+\.\d+$/.test(value))
    .sort(compare)) {
    const [major, minor] = version.split(".").map(Number);
    if (
      compare(version, minimum) < 0 ||
      major > lastMajor ||
      (major === lastMajor && minor > lastMinor)
    )
      continue;
    minors.set(version.split(".").slice(0, 2).join("."), version);
  }
  assert(minors.size > 0, "No supported TypeScript versions found");
  return [...minors.values()];
}

export function driftManifest(source, compiler) {
  assert(["latest", "next"].includes(compiler));
  const manifest = structuredClone(source);
  for (const [name, version] of Object.entries(manifest.dependencies ?? {}))
    if (["jose", "@clerk/backend", "@clerk/shared"].includes(name))
      manifest.dependencies[name] = version.startsWith("^")
        ? version
        : `^${version}`;
  if (manifest.devDependencies?.typescript)
    manifest.devDependencies.typescript = compiler;
  if (manifest.devDependencies?.zod) manifest.devDependencies.zod = "^4.6.6";
  return manifest;
}

export async function main(args = []) {
  if (args.length) {
    assert.deepEqual(args, ["--prepare-drift"]);
    // This command changes manifests only in a disposable Actions checkout.
    assert.equal(
      process.env.GITHUB_ACTIONS,
      "true",
      "Drift preparation is CI-only",
    );
    for (const group of ["packages", "apps"])
      for (const entry of readdirSync(join(root, group), {
        withFileTypes: true,
      })) {
        if (!entry.isDirectory()) continue;
        const path = join(root, group, entry.name, "package.json");
        if (!existsSync(path)) continue;
        const manifest = driftManifest(
          readJSON(path),
          process.env.TOOLGRAIN_COMPILER,
        );
        writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
      }
    // A compatible old resolution could otherwise hide upstream drift. Normal
    // CI keeps its lockfile; only this guarded disposable probe resolves afresh.
    rmSync(join(root, "bun.lock"), { force: true });
    return;
  }
  const response = await fetch("https://registry.npmjs.org/typescript", {
    signal: AbortSignal.timeout(30000),
  });
  assert(response.ok, "Cannot read TypeScript registry versions");
  const { versions } = await response.json();
  const policy = readJSON(join(root, "support-policy.json"));
  const development = readJSON(join(root, "packages/mcp/package.json"))
    .devDependencies.typescript;
  const matrix = compilerVersions(
    Object.keys(versions),
    policy.typescript.minimum,
    development,
  );
  const value = `versions=${JSON.stringify(matrix)}\n`;
  console.log(value.trim());
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, value);
}
