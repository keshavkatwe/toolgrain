import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { verifyPublishedPackage } from "../src/verify-publication.mjs";

const pkg = { name: "@toolgrain/mcp", version: "0.1.1" };
const bytes = Buffer.from("reviewed archive");
const integrity = (algorithm) =>
  `${algorithm}-${createHash(algorithm).update(bytes).digest("base64")}`;
const body = {
  "dist-tags": { latest: pkg.version },
  versions: {
    [pkg.version]: {
      ...pkg,
      dist: {
        tarball: "https://registry.npmjs.org/archive.tgz",
        integrity: integrity("sha512"),
      },
    },
  },
};
const archive = { bytes, integrity: integrity("sha256") };

test("registry verification waits for installer metadata and compares the actual artifact bytes", async () => {
  let calls = 0;
  let delays = 0;
  const result = await verifyPublishedPackage(pkg, archive, {
    fetchImpl: async (url) => {
      if (String(url).endsWith(".tgz")) return new Response(bytes);
      calls++;
      return Response.json(
        calls <= 2 ? { ...body, "dist-tags": { latest: "0.1.0" } } : body,
      );
    },
    delay: async () => {
      delays++;
    },
  });
  assert.equal(delays, 1);
  assert.equal(calls, 4);
  assert.equal(result.matchedArtifact, true);
});

test("registry verification rejects missing releases, mismatched archives and invalid registry integrity", async () => {
  await assert.rejects(
    verifyPublishedPackage(pkg, archive, {
      attempts: 1,
      fetchImpl: async () => Response.json({}, { status: 404 }),
    }),
    /not available/,
  );
  const fetchImpl = async (url) =>
    String(url).endsWith(".tgz") ? new Response(bytes) : Response.json(body);
  await assert.rejects(
    verifyPublishedPackage(
      pkg,
      { ...archive, integrity: "sha256-wrong" },
      { fetchImpl },
    ),
    /differ from/,
  );
  await assert.rejects(
    verifyPublishedPackage(pkg, archive, {
      fetchImpl: async (url) =>
        String(url).endsWith(".tgz")
          ? new Response("wrong")
          : Response.json(body),
    }),
    /integrity mismatch/,
  );
});

test("RC verification checks rc in both metadata formats and preserves stable latest", async () => {
  const candidate = { ...pkg, version: "0.2.0-rc.0" };
  const metadata = {
    "dist-tags": { latest: pkg.version, rc: candidate.version },
    versions: {
      [candidate.version]: { ...body.versions[pkg.version], ...candidate },
    },
  };
  const accepts = [];
  const fetchImpl = async (url, options) => {
    if (String(url).endsWith(".tgz")) return new Response(bytes);
    accepts.push(options.headers.accept);
    return Response.json(metadata);
  };
  const result = await verifyPublishedPackage(candidate, archive, {
    fetchImpl,
    tag: "rc",
    expectedLatest: pkg.version,
  });
  assert.equal(result.tag, "rc");
  assert.deepEqual(accepts.sort(), [
    "application/json",
    "application/vnd.npm.install-v1+json",
  ]);
  await assert.rejects(
    verifyPublishedPackage(candidate, archive, {
      fetchImpl,
      tag: "rc",
      expectedLatest: "0.2.0",
    }),
    /stable latest changed/,
  );
  await assert.rejects(
    verifyPublishedPackage(candidate, archive, {
      fetchImpl,
      attempts: 1,
      tag: "latest",
    }),
    /not available under latest/,
  );
});
