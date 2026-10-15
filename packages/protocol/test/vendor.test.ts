import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../src/index.js";

it("retains the exact pinned schema bytes and provenance", () => {
  const path = new URL("../src/vendor/", import.meta.url);
  const provenance = JSON.parse(
    readFileSync(new URL("provenance.json", path), "utf8"),
  );
  expect(provenance.commit).toBe("271ecc9accafdd9b83a3c869fa67c22953b2af80");
  expect(provenance.revision).toBe(PROTOCOL_VERSION);
  expect(
    createHash("sha256")
      .update(readFileSync(new URL("schema.ts", path)))
      .digest("hex"),
  ).toBe(provenance.sha256);
  expect(readFileSync(new URL("LICENSE", path), "utf8")).toContain(
    "Apache License",
  );
});
