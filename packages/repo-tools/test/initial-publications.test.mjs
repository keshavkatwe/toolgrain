import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  initialPublicationArchive,
  packInitialPublications,
  readInitialPublications,
} from "../src/initial-publications.mjs";

test("first-publication archives retain reviewed source/version/bytes and reject substitution", (t) => {
  const root = mkdtempSync(join(tmpdir(), "toolgrain-initial-publication-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, data) =>
    writeFileSync(join(root, path), JSON.stringify(data, null, 2));
  mkdirSync(join(root, ".changeset"));
  const version = "0.3.0-alpha.2";
  const packages = ["mcp", "react"].map((short) => ({
    short,
    name: `@toolgrain/${short}`,
    version,
    type: "module",
    files: ["dist"],
    publishConfig: { tag: "alpha" },
  }));
  write("package.json", {
    name: "fixture",
    private: true,
    workspaces: ["packages/*"],
  });
  write(".changeset/config.json", {
    fixed: [packages.map(({ name }) => name)],
  });
  write("bun.lock", {
    lockfileVersion: 1,
    workspaces: {
      "": { name: "fixture" },
      ...Object.fromEntries(
        packages.map(({ short, name }) => [
          `packages/${short}`,
          { name, version },
        ]),
      ),
    },
    packages: {},
  });
  for (const pkg of packages) {
    mkdirSync(join(root, `packages/${pkg.short}/dist`), { recursive: true });
    write(`packages/${pkg.short}/package.json`, pkg);
    writeFileSync(
      join(root, `packages/${pkg.short}/dist/index.js`),
      "export const value = 1;\n",
    );
  }
  assert.deepEqual(readInitialPublications(root, packages), []);
  write(".changeset/initial-publications.json", ["@toolgrain/react"]);
  const output = join(root, "archives");
  const sha = "1".repeat(40);
  const manifest = packInitialPublications(root, output, sha);
  assert.equal(manifest.archives.length, 1);
  const pkg = packages[1];
  const artifact = initialPublicationArchive(output, pkg, sha);
  assert(artifact.bytes.length > 0);
  const second = join(root, "second-archives");
  packInitialPublications(root, second, sha);
  assert.deepEqual(
    initialPublicationArchive(second, pkg, sha).bytes,
    artifact.bytes,
  );
  assert.equal(initialPublicationArchive(output, packages[0], sha), undefined);
  assert.throws(
    () => initialPublicationArchive(output, pkg, "2".repeat(40)),
    /source SHA/,
  );
  assert.throws(
    () =>
      initialPublicationArchive(
        output,
        { ...pkg, version: "0.3.0-alpha.3" },
        sha,
      ),
    /version mismatch/,
  );
  assert.throws(
    () => packInitialPublications(root, output, "short"),
    /full source SHA/,
  );
  const path = join(output, manifest.archives[0].filename);
  const original = readFileSync(path);
  writeFileSync(path, "different archive");
  assert.throws(
    () => initialPublicationArchive(output, pkg, sha),
    /artifact integrity/,
  );
  writeFileSync(path, original);
  manifest.archives[0].filename = "../outside.tgz";
  writeFileSync(
    join(output, "initial-publications.json"),
    JSON.stringify(manifest),
  );
  assert.throws(
    () => initialPublicationArchive(output, pkg, sha),
    /archive path/,
  );
});
