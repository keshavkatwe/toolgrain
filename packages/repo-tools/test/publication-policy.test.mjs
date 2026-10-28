import assert from "node:assert/strict";
import { test } from "node:test";
import {
  publicationPolicy,
  stablePublicationBaseline,
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
  ref: "refs/heads/prerelease/0.2.0-rc.0",
  eventName: "workflow_dispatch",
  preState,
  stableVersion: "0.1.3",
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
});

test("RC publication requires manual dispatch, an exact versioned branch, and one stable baseline", () => {
  assert.deepEqual(publicationPolicy(rc, context), {
    version: "0.2.0-rc.0",
    tag: "rc",
    stableVersion: "0.1.3",
  });
  for (const invalid of [
    { eventName: "push" },
    { eventName: "pull_request" },
    { ref: "refs/heads/feat/oauth-resource-scopes-53" },
    { ref: "refs/heads/prerelease/0.2.0-rc.1" },
    { preState: undefined },
    { preState: { ...preState, mode: "exit" } },
    { preState: { ...preState, tag: "latest" } },
    { stableVersion: undefined },
    { stableVersion: "0.2.0-rc.0" },
  ])
    assert.throws(() => publicationPolicy(rc, { ...context, ...invalid }));
  assert.throws(() => publicationPolicy({ ...rc, version: "0.2.0" }, context));
  assert.throws(() =>
    publicationPolicy({ ...rc, version: "0.2.0-beta.0" }, context),
  );
  assert.throws(() =>
    publicationPolicy({ ...rc, packages: packages("latest") }, context),
  );
});

test("the publication guard prevents prereleases from changing latest or publishing other versions/packages", () => {
  const policy = publicationPolicy(rc, context);
  const entry = {
    kind: "publish",
    name: names[0],
    version: rc.version,
    tag: "rc",
  };
  const plan = (value) => ({ version: 1, plan: [[value]] });
  validatePublishPlan(plan(entry), rc.packages, policy);
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
      validatePublishPlan(plan({ ...entry, ...invalid }), rc.packages, policy),
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
  assert.throws(() => validatePublishPlan({ version: 1 }, rc.packages, policy));
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
