import assert from "node:assert/strict";
import { test } from "node:test";
import { compilerVersions, driftManifest } from "../src/support-matrix.mjs";

test("weekly compiler coverage keeps every approved minor without prereleases or future minors", () => {
  assert.deepEqual(
    compilerVersions(
      [
        "5.4.9",
        "5.5.3",
        "5.5.4",
        "5.5.5",
        "5.6.9",
        "5.6.10",
        "6.0.0-beta",
        "6.0.1",
        "7.0.2",
        "7.0.3",
        "7.1.0",
        "8.0.0-dev.1",
      ],
      "5.5.4",
      "7.0.2",
    ),
    ["5.5.5", "5.6.10", "6.0.1", "7.0.3"],
  );
  assert.throws(
    () => compilerVersions(["5.5.3", "7.1.0"], "5.5.4", "7.0.2"),
    /No supported/,
  );
});

test("dependency probes preserve runtime/peer floors and exact minimum aliases", () => {
  const manifest = {
    engines: { node: "^24.20.0", bun: ">=1.4.4 <2" },
    dependencies: {
      "@toolgrain/mcp": "workspace:*",
      jose: "6.2.13",
      "@clerk/backend": "3.26.0",
      "@clerk/shared": "4.41.0",
    },
    peerDependencies: { zod: "^4.0.0" },
    devDependencies: {
      typescript: "7.0.2",
      zod: "4.6.7",
      "typescript-minimum": "npm:typescript@5.5.4",
    },
  };
  const snapshot = structuredClone(manifest);
  const probe = driftManifest(manifest, "next");
  assert.deepEqual(manifest, snapshot);
  assert.deepEqual(probe.engines, manifest.engines);
  assert.deepEqual(probe.peerDependencies, manifest.peerDependencies);
  assert.equal(probe.dependencies["@toolgrain/mcp"], "workspace:*");
  assert.equal(probe.dependencies.jose, "^6.2.13");
  assert.equal(probe.dependencies["@clerk/backend"], "^3.26.0");
  assert.equal(probe.dependencies["@clerk/shared"], "^4.41.0");
  assert.equal(probe.devDependencies.typescript, "next");
  assert.equal(
    probe.devDependencies["typescript-minimum"],
    "npm:typescript@5.5.4",
  );
  assert.deepEqual(driftManifest(probe, "next"), probe);
  assert.throws(() => driftManifest(manifest, "8.0.0"));
});
