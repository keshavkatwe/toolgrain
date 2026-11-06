import assert from "node:assert/strict";
import { test } from "node:test";
import {
  publicationBaselines,
  publicationPolicy,
  stablePublicationBaseline,
  validateLatestBaselines,
  validatePublishPlan,
} from "../src/publication-policy.mjs";

const names = ["protocol", "mcp", "http", "node", "jwt", "clerk"].map(
  (name) => `@toolgrain/${name}`,
);
const packages = (tag) =>
  names.map((name) => ({ name, publishConfig: { tag } }));
const preState = { mode: "pre", tag: "rc" };
const rc = { version: "0.2.0-rc.0", packages: packages("rc") };
const context = {
  ref: "refs/heads/prerelease/0.2",
  eventName: "workflow_dispatch",
  preState,
  stableVersion: "0.1.3",
  requestedVersion: "0.2.0-rc.0",
  expectedSha: "1".repeat(40),
  sourceSha: "1".repeat(40),
};

test("stable publication retains the main-only latest policy and refuses prerelease state", () => {
  const source = { version: "0.1.3", packages: packages("latest") };
  assert.equal(
    publicationPolicy(source, { ref: "refs/heads/main" }).tag,
    "latest",
  );
  assert.throws(
    () => publicationPolicy(source, { ref: "refs/heads/main", preState }),
    /prerelease state/,
  );
  assert.throws(
    () => publicationPolicy(rc, { ref: "refs/heads/main" }),
    /stable version/,
  );
  assert.throws(() =>
    publicationPolicy(
      { ...source, packages: packages("rc") },
      { ref: "refs/heads/main" },
    ),
  );
  assert.throws(
    () =>
      publicationPolicy(source, {
        ref: "refs/heads/main",
        requestedVersion: rc.version,
      }),
    /Prerelease inputs/,
  );
  assert.throws(
    () =>
      publicationPolicy(source, {
        ref: "refs/heads/main",
        expectedSha: context.expectedSha,
      }),
    /Prerelease inputs/,
  );
  for (const tag of ["alpha", "beta"]) {
    assert.throws(
      () =>
        publicationPolicy(
          { version: `0.2.0-${tag}.0`, packages: packages(tag) },
          { ref: "refs/heads/main" },
        ),
      /stable version/,
    );
    assert.throws(() =>
      publicationPolicy(
        { ...source, packages: packages(tag) },
        { ref: "refs/heads/main" },
      ),
    );
  }
});

for (const tag of ["alpha", "beta", "rc"])
  test(`${tag} publication requires a series branch, explicit version/SHA, and matching channel`, () => {
    const version = `0.2.0-${tag}.0`;
    const source = { version, packages: packages(tag) };
    const prepared = {
      ...context,
      preState: { mode: "pre", tag },
      requestedVersion: version,
    };
    assert.deepEqual(publicationPolicy(source, prepared), {
      version,
      tag,
      stableVersion: "0.1.3",
    });
    for (const invalid of [
      { eventName: "push" },
      { eventName: "pull_request" },
      { ref: "refs/heads/feat/oauth-resource-scopes-53" },
      { ref: "refs/heads/prerelease/0.3" },
      { ref: "refs/heads/prerelease/0.2.0-rc.0" },
      { requestedVersion: undefined },
      { requestedVersion: "0.2.0-rc.1" },
      { expectedSha: undefined },
      { expectedSha: "1".repeat(7) },
      { expectedSha: `${"1".repeat(40)}\n` },
      { sourceSha: "2".repeat(40) },
      { preState: undefined },
      { preState: { ...preState, mode: "exit" } },
      { preState: { ...preState, tag: "latest" } },
      { preState: { ...preState, tag: tag === "rc" ? "beta" : "rc" } },
      { stableVersion: undefined },
      { stableVersion: "0.2.0-rc.0" },
    ])
      assert.throws(() =>
        publicationPolicy(source, { ...prepared, ...invalid }),
      );
    assert.throws(() =>
      publicationPolicy({ ...source, version: "0.2.0" }, prepared),
    );
    assert.throws(() =>
      publicationPolicy({ ...source, packages: packages("latest") }, prepared),
    );
    assert.throws(() =>
      publicationPolicy(
        { ...source, packages: packages(tag === "rc" ? "beta" : "rc") },
        prepared,
      ),
    );
  });

test("unsupported channels and malformed prerelease versions cannot publish", () => {
  for (const version of [
    "0.2.0-next.0",
    "0.2.0-dev.0",
    "0.2.0-alpha",
    "0.2.0-beta.01",
    "0.2.0-rc.0\n",
    "0.2.0-alpha.0+build",
    "00.2.0-alpha.0",
  ])
    assert.throws(
      () =>
        publicationPolicy(
          { ...rc, version },
          { ...context, requestedVersion: version },
        ),
      /requires X.Y.Z/,
    );
});

test("a failed RC can be followed by a new immutable version on the same series branch", () => {
  const policy = publicationPolicy(
    { ...rc, version: "0.2.0-rc.1" },
    {
      ...context,
      requestedVersion: "0.2.0-rc.1",
      expectedSha: "2".repeat(40),
      sourceSha: "2".repeat(40),
    },
  );
  assert.equal(policy.version, "0.2.0-rc.1");
  assert.equal(policy.tag, "rc");
  assert.equal(policy.stableVersion, "0.1.3");
});

for (const tag of ["alpha", "beta", "rc"])
  test(`the ${tag} publication guard rejects other channels, versions, and packages`, () => {
    const source = { version: `0.2.0-${tag}.0`, packages: packages(tag) };
    const policy = publicationPolicy(source, {
      ...context,
      preState: { mode: "pre", tag },
      requestedVersion: source.version,
    });
    const entry = {
      kind: "publish",
      name: names[0],
      version: source.version,
      tag,
    };
    const plan = (value) => ({ version: 1, plan: [[value]] });
    validatePublishPlan(plan(entry), source.packages, policy);
    validatePublishPlan(
      plan({ ...entry, kind: "tag-only" }),
      rc.packages,
      policy,
    );
    for (const invalid of [
      { tag: "latest" },
      { version: "0.2.0" },
      { name: "unrelated-package" },
      { kind: "unknown" },
    ])
      assert.throws(() =>
        validatePublishPlan(
          plan({ ...entry, ...invalid }),
          rc.packages,
          policy,
        ),
      );
    assert.throws(() =>
      validatePublishPlan(
        { version: 1, plan: [[entry, entry]] },
        rc.packages,
        policy,
      ),
    );
    assert.throws(() =>
      validatePublishPlan({ version: 2, plan: [] }, rc.packages, policy),
    );
    assert.throws(() =>
      validatePublishPlan({ version: 1 }, rc.packages, policy),
    );
  });

test("RC baseline is read from npm rather than older Changesets pre-state fields", async () => {
  const fetchImpl = async () =>
    Response.json({ "dist-tags": { latest: "0.1.3" } });
  assert.equal(
    await stablePublicationBaseline(rc.packages, fetchImpl),
    "0.1.3",
  );
  await assert.rejects(
    stablePublicationBaseline(rc.packages, async () => Response.json({})),
    /must already exist/,
  );
  await assert.rejects(
    stablePublicationBaseline(
      rc.packages,
      async () => new Response(null, { status: 403 }),
    ),
    /cannot read/,
  );
  await assert.rejects(
    stablePublicationBaseline(rc.packages, async (url) =>
      Response.json({
        "dist-tags": {
          latest: String(url).endsWith("mcp") ? "0.1.2" : "0.1.3",
        },
      }),
    ),
    /one shared/,
  );
});

test("first-publication exceptions preserve every established latest and an explicit absence", async () => {
  const group = [...rc.packages, { name: "@toolgrain/react" }];
  const fetchImpl = async (url) =>
    String(url).endsWith("react")
      ? new Response(null, { status: 404 })
      : Response.json({ "dist-tags": { latest: "0.2.0" } });
  const baseline = await publicationBaselines(
    group,
    ["@toolgrain/react"],
    fetchImpl,
  );
  assert.equal(baseline.stableVersion, "0.2.0");
  assert.equal(baseline.latest["@toolgrain/react"], null);
  assert.deepEqual(baseline.unpublished, ["@toolgrain/react"]);
  assert.equal(
    validateLatestBaselines(group, baseline.latest, "0.2.0", [
      "@toolgrain/react",
    ]),
    baseline.latest,
  );
  await assert.rejects(
    publicationBaselines(group, [], fetchImpl),
    /cannot read/,
  );
  assert.throws(
    () => validateLatestBaselines(group, baseline.latest, "0.2.0"),
    /invalid latest/,
  );
  assert.throws(() => validateLatestBaselines(group, {}, "0.2.0"), /exactly/);
  await assert.rejects(
    publicationBaselines(group, ["other"], fetchImpl),
    /Unknown/,
  );
  await assert.rejects(
    publicationBaselines(
      group,
      ["@toolgrain/react", "@toolgrain/react"],
      fetchImpl,
    ),
    /Duplicate/,
  );
});

test("a first alpha can already exist without latest, but a prior stable release cannot be hidden", async () => {
  const group = [{ name: "@toolgrain/mcp" }, { name: "@toolgrain/react" }];
  const metadata = {
    "dist-tags": { alpha: "0.3.0-alpha.2" },
    versions: { "0.3.0-alpha.2": {} },
  };
  const fetchImpl = async (url) =>
    Response.json(
      String(url).endsWith("react")
        ? metadata
        : { "dist-tags": { latest: "0.2.0" } },
    );
  assert.equal(
    (await publicationBaselines(group, ["@toolgrain/react"], fetchImpl)).latest[
      "@toolgrain/react"
    ],
    null,
  );
  metadata.versions["0.1.0"] = {};
  await assert.rejects(
    publicationBaselines(group, ["@toolgrain/react"], fetchImpl),
    /established stable/,
  );
  await assert.rejects(
    publicationBaselines(
      group,
      ["@toolgrain/react"],
      async () => new Response(null, { status: 500 }),
    ),
    /cannot read/,
  );
  await assert.rejects(
    publicationBaselines(group, ["@toolgrain/react"], async (_url, options) =>
      options.headers.accept === "application/json"
        ? Response.json({ "dist-tags": { latest: "0.2.0" } })
        : Response.json({ "dist-tags": { latest: "0.1.0" } }),
    ),
    /formats disagree/,
  );
  await assert.rejects(
    publicationBaselines(
      [{ name: "@toolgrain/react" }],
      ["@toolgrain/react"],
      async () => new Response(null, { status: 404 }),
    ),
    /one shared/,
  );
});

test("npm's first-release latest is preserved only with an exact initial pin and no stable history", async () => {
  const group = [{ name: "@toolgrain/mcp" }, { name: "@toolgrain/react" }];
  const initial = ["@toolgrain/react"];
  const version = "0.3.0-alpha.2";
  const pinned = { "@toolgrain/react": version };
  const metadata = {
    "dist-tags": { latest: version, alpha: version },
    versions: { "0.0.0-stage": {}, [version]: {} },
  };
  const fetchImpl = async (url) =>
    Response.json(
      String(url).endsWith("react")
        ? metadata
        : { "dist-tags": { latest: "0.2.0" } },
    );
  const baseline = await publicationBaselines(
    group,
    initial,
    fetchImpl,
    pinned,
  );
  assert.equal(baseline.stableVersion, "0.2.0");
  assert.deepEqual(baseline.unpublished, []);
  assert.deepEqual(baseline.latest, {
    "@toolgrain/mcp": "0.2.0",
    "@toolgrain/react": version,
  });
  validateLatestBaselines(group, baseline.latest, "0.2.0", initial, pinned);
  await assert.rejects(
    publicationBaselines(group, initial, fetchImpl),
    /established stable/,
  );
  for (const changed of [null, "0.3.0-alpha.3"])
    assert.throws(
      () =>
        validateLatestBaselines(
          group,
          { ...baseline.latest, "@toolgrain/react": changed },
          "0.2.0",
          initial,
          pinned,
        ),
      /invalid latest/,
    );
  for (const invalid of [
    [],
    null,
    { "@toolgrain/mcp": version },
    { "@toolgrain/react": "0.3.0" },
    { "@toolgrain/react": `${version}\n` },
  ])
    await assert.rejects(
      publicationBaselines(group, initial, fetchImpl, invalid),
    );
  metadata["dist-tags"].latest = "0.3.0-alpha.3";
  await assert.rejects(
    publicationBaselines(group, initial, fetchImpl, pinned),
    /approved baseline/,
  );
  metadata["dist-tags"].latest = version;
  metadata.versions["0.1.0"] = {};
  await assert.rejects(
    publicationBaselines(group, initial, fetchImpl, pinned),
    /established stable/,
  );
  delete metadata.versions["0.1.0"];
  delete metadata.versions[version];
  await assert.rejects(
    publicationBaselines(group, initial, fetchImpl, pinned),
    /version is missing/,
  );
});
