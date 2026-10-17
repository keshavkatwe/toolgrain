import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "../src/index.js";
import { PROTOCOL_VERSION as LEGACY_SUBPATH_VERSION } from "../src/legacy.js";

it.each([
  {
    revision: PROTOCOL_VERSION,
    path: "vendor/2026-07-28/",
    sha256: "742750af0bb8c716e7030c4977c992b55d1adc4407e9e66997db5846baedc2cd",
  },
  {
    revision: LEGACY_PROTOCOL_VERSION,
    path: "vendor/2025-06-18/",
    sha256: "7d7f4cc6f3adb76e3fd5e1eee6bab8b1e183cfaf719da66d2aa5661737ca9539",
  },
])(
  "retains the exact pinned $revision schema bytes and provenance",
  ({ revision, path, sha256 }) => {
    const base = new URL(`../src/${path}`, import.meta.url);
    const provenance = JSON.parse(
      readFileSync(new URL("provenance.json", base), "utf8"),
    );
    expect(provenance.commit).toBe("271ecc9accafdd9b83a3c869fa67c22953b2af80");
    expect(provenance.revision).toBe(revision);
    expect(provenance.sourcePath).toBe(`schema/${revision}/schema.ts`);
    expect(provenance.sha256).toBe(sha256);
    expect(
      createHash("sha256")
        .update(readFileSync(new URL("schema.ts", base)))
        .digest("hex"),
    ).toBe(sha256);
    expect(readFileSync(new URL("LICENSE", base), "utf8")).toContain(
      "Apache License",
    );
  },
);

it("exports both supported revisions without replacing modern root definitions", () => {
  expect(PROTOCOL_VERSION).toBe("2026-07-28");
  expect(LEGACY_PROTOCOL_VERSION).toBe("2025-06-18");
  expect(LEGACY_SUBPATH_VERSION).toBe(LEGACY_PROTOCOL_VERSION);
  expect(SUPPORTED_PROTOCOL_VERSIONS).toEqual([
    PROTOCOL_VERSION,
    LEGACY_PROTOCOL_VERSION,
  ]);
});
