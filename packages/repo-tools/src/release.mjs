import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));

function libraries(directory, expectedVersion) {
  const { fixed } = readJSON(join(directory, ".changeset/config.json"));
  assert.equal(fixed.length, 1, "Use one fixed release group");
  assert(fixed[0].length > 0, "The release group must not be empty");
  const packages = fixed[0].map((name) => {
    assert(
      /^@toolgrain\/[a-z][a-z0-9-]*$/.test(name),
      "Expected an explicit Toolgrain library name",
    );
    const short = name.slice("@toolgrain/".length);
    const manifest = readJSON(
      join(directory, "packages", short, "package.json"),
    );
    assert.equal(manifest.name, name);
    return { short, ...manifest };
  });
  const version = expectedVersion ?? packages[0].version;
  assert(
    typeof version === "string" && version.length > 0,
    "A library version is required",
  );
  for (const manifest of packages)
    assert.equal(
      manifest.version,
      version,
      `${manifest.name} must use the shared version`,
    );
  return { version, packages };
}

// Bun 1.3.14 keeps stale workspace versions during --lockfile-only installs and
// uses them when packing workspace:* dependencies. Preserve all other bytes.
function alignedLockfile(text, packages) {
  for (const { short, name, version } of packages) {
    const pattern = new RegExp(
      `(^    "packages/${short}": \\{\\r?\\n      "name": "${name}",\\r?\\n      "version": ")([^"]+)(")`,
      "gm",
    );
    assert.equal(
      [...text.matchAll(pattern)].length,
      1,
      `Missing or ambiguous Bun workspace: ${name}`,
    );
    text = text.replace(
      pattern,
      (_, prefix, _old, suffix) => `${prefix}${version}${suffix}`,
    );
  }
  return text;
}

export function checkRelease(directory, version) {
  const state = libraries(directory, version);
  const lockfile = readFileSync(join(directory, "bun.lock"), "utf8");
  assert.equal(
    alignedLockfile(lockfile, state.packages),
    lockfile,
    "Bun workspace versions must match the library manifests",
  );
  return state;
}

export function syncLockfile(directory) {
  const { packages } = libraries(directory);
  const path = join(directory, "bun.lock");
  writeFileSync(path, alignedLockfile(readFileSync(path, "utf8"), packages));
}

export async function main(args = []) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { version: { type: "string" } },
  });
  assert.equal(
    positionals.length,
    1,
    "Usage: release <check|sync-lock> [--version X.Y.Z]",
  );
  if (positionals[0] === "sync-lock") {
    assert.equal(
      values.version,
      undefined,
      "sync-lock takes no version option",
    );
    syncLockfile(root);
  } else assert.equal(positionals[0], "check", "Unknown release command");
  const { version, packages } = checkRelease(root, values.version);
  console.log(
    `Release alignment passed: ${packages.length} libraries at ${version}`,
  );
}
