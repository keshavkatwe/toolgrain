import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { runChangesetsNpm } from "./changesets-npm.mjs";
import { initialPublicationNames } from "./publication-policy.mjs";
import { checkRelease } from "./release.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const digest = (bytes) =>
  `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));

export function readInitialPublications(directory, packages) {
  const path = join(directory, ".changeset/initial-publications.json");
  return initialPublicationNames(
    packages,
    existsSync(path) ? readJSON(path) : [],
  );
}

/** Pack real candidate archives for first publication after the full verification jobs. */
export function packInitialPublications(directory, output, sourceSha) {
  assert(
    /^[a-f0-9]{40}$/.test(sourceSha),
    "Initial publication requires the full source SHA",
  );
  const release = checkRelease(directory);
  const initial = readInitialPublications(directory, release.packages);
  mkdirSync(output, { recursive: true });
  const archives = initial.map((name) => {
    const pkg = release.packages.find((value) => value.name === name);
    const packed = runChangesetsNpm(
      ["pack", `packages/${pkg.short}`, "--pack-destination", output, "--json"],
      { cwd: directory },
    );
    assert.equal(packed.status, 0, packed.stderr);
    const [{ filename }] = JSON.parse(packed.stdout);
    assert.equal(
      filename,
      basename(filename),
      "Invalid candidate archive path",
    );
    return {
      name,
      version: release.version,
      filename,
      integrity: digest(readFileSync(join(output, filename))),
    };
  });
  const manifest = { version: release.version, sourceSha, archives };
  writeFileSync(
    join(output, "initial-publications.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

/** An omitted/tag-only entry still has to match the reviewed first-publication archive. */
export function initialPublicationArchive(directory, pkg, sourceSha) {
  const manifest = readJSON(join(directory, "initial-publications.json"));
  assert.equal(
    manifest.sourceSha,
    sourceSha,
    "Initial publication source SHA mismatch",
  );
  assert.equal(
    manifest.version,
    pkg.version,
    "Initial publication version mismatch",
  );
  assert(
    Array.isArray(manifest.archives),
    "Invalid initial publication archive manifest",
  );
  const entries = manifest.archives.filter(({ name }) => name === pkg.name);
  assert(entries.length <= 1, "Duplicate initial publication archive");
  if (!entries.length) return undefined;
  const entry = entries[0];
  assert.equal(entry.version, pkg.version);
  assert.equal(typeof entry.filename, "string");
  assert.equal(
    entry.filename,
    basename(entry.filename),
    "Invalid candidate archive path",
  );
  assert(
    entry.filename.endsWith(".tgz"),
    "Invalid candidate archive extension",
  );
  const bytes = readFileSync(join(directory, entry.filename));
  assert.equal(
    digest(bytes),
    entry.integrity,
    "Initial publication artifact integrity mismatch",
  );
  return { bytes, integrity: entry.integrity };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      directory: { type: "string" },
      "source-sha": { type: "string" },
    },
  });
  assert(values.directory, "--directory is required");
  console.log(
    JSON.stringify(
      packInitialPublications(root, values.directory, values["source-sha"]),
    ),
  );
}
