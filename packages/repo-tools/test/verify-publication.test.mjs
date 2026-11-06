import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { main, verifyPublishedPackage } from "../src/verify-publication.mjs";

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

test("first publication verifies artifact bytes and preserves its approved latest baseline", async () => {
  const initial = { name: "@toolgrain/react", version: "0.3.0-alpha.2" };
  const metadata = {
    "dist-tags": { alpha: initial.version },
    versions: {
      [initial.version]: { ...body.versions[pkg.version], ...initial },
    },
  };
  const fetchImpl = async (url) =>
    String(url).endsWith(".tgz")
      ? new Response(bytes)
      : Response.json(metadata);
  const result = await verifyPublishedPackage(initial, archive, {
    fetchImpl,
    tag: "alpha",
    expectedLatest: null,
  });
  assert(result.matchedArtifact);
  metadata["dist-tags"].latest = initial.version;
  await assert.rejects(
    verifyPublishedPackage(initial, archive, {
      fetchImpl,
      tag: "alpha",
      expectedLatest: null,
    }),
    /stable latest changed/,
  );
  assert(
    (
      await verifyPublishedPackage(initial, archive, {
        fetchImpl,
        tag: "alpha",
        expectedLatest: initial.version,
      })
    ).matchedArtifact,
  );
  metadata["dist-tags"].latest = "0.3.0-alpha.3";
  await assert.rejects(
    verifyPublishedPackage(initial, archive, {
      fetchImpl,
      tag: "alpha",
      expectedLatest: initial.version,
    }),
    /stable latest changed/,
  );
});

for (const tag of ["alpha", "beta", "rc"])
  test(`${tag} verification checks both metadata formats and preserves stable latest`, async () => {
    const candidate = { ...pkg, version: `0.2.0-${tag}.0` };
    const metadata = {
      "dist-tags": { latest: pkg.version, [tag]: candidate.version },
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
      tag,
      expectedLatest: pkg.version,
    });
    assert.equal(result.tag, tag);
    assert.deepEqual(accepts.sort(), [
      "application/json",
      "application/vnd.npm.install-v1+json",
    ]);
    await assert.rejects(
      verifyPublishedPackage(candidate, archive, {
        fetchImpl,
        tag,
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

test("the verification CLI requires a stable baseline for every prerelease channel", async () => {
  for (const tag of ["alpha", "beta", "rc"])
    await assert.rejects(
      main(["--pack-dir", "unused", "--tag", tag]),
      /requires --preserve-latest/,
    );
  await assert.rejects(
    main(["--pack-dir", "unused", "--tag", "next"]),
    /Unsupported publication tag/,
  );
});
