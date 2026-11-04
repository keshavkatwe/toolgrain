import assert from "node:assert/strict";

const stable = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const candidate =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-rc\.(0|[1-9][0-9]*)$/;

/** Stable automation stays on main; RC publication is an explicit dispatch of a prepared branch. */
export function publicationPolicy(
  { version, packages },
  {
    ref,
    eventName,
    preState,
    stableVersion,
    requestedVersion,
    expectedSha,
    sourceSha,
  },
) {
  if (ref === "refs/heads/main") {
    assert(
      !requestedVersion && !expectedSha,
      "RC inputs cannot select stable publication on main",
    );
    assert(!preState, "Stable publication refuses Changesets prerelease state");
    assert(stable.test(version), "Main must contain a stable version");
    for (const pkg of packages) assert.equal(pkg.publishConfig.tag, "latest");
    return { version, tag: "latest", stableVersion: "" };
  }
  assert.equal(
    eventName,
    "workflow_dispatch",
    "RC publication requires manual dispatch",
  );
  const release = candidate.exec(version);
  assert(
    release && release[0] === version,
    "RC publication requires X.Y.Z-rc.N",
  );
  assert.equal(
    ref,
    `refs/heads/prerelease/${release[1]}.${release[2]}`,
    "RC branch must match the prepared major/minor release series",
  );
  assert.equal(
    requestedVersion,
    version,
    "Manually confirm the exact prepared RC version",
  );
  assert(
    typeof expectedSha === "string" &&
      expectedSha.length === 40 &&
      /^[a-f0-9]{40}$/.test(expectedSha),
    "RC publication requires a full expected commit SHA",
  );
  assert.equal(
    sourceSha,
    expectedSha,
    "The workflow commit differs from the approved RC commit",
  );
  assert.equal(
    preState?.mode,
    "pre",
    "RC publication requires active prerelease state",
  );
  assert.equal(preState.tag, "rc", "RC publication uses only the rc npm tag");
  for (const pkg of packages) {
    assert.equal(
      pkg.publishConfig.tag,
      "rc",
      "RC manifests must use the rc npm tag",
    );
  }
  assert(
    typeof stableVersion === "string" && stable.test(stableVersion),
    "RC publication requires a stable registry baseline",
  );
  return { version, tag: "rc", stableVersion };
}

/** Changesets 3 pre-state has only mode/tag; capture the actual shared npm latest separately. */
export async function stablePublicationBaseline(packages, fetchImpl = fetch) {
  const versions = await Promise.all(
    packages.map(async ({ name }) => {
      const response = await fetchImpl(
        `https://registry.npmjs.org/${encodeURIComponent(name)}`,
        {
          headers: { accept: "application/vnd.npm.install-v1+json" },
          signal: AbortSignal.timeout(30000),
        },
      );
      assert(response.ok, `${name}: cannot read the stable registry baseline`);
      const version = (await response.json())["dist-tags"]?.latest;
      assert(
        typeof version === "string" && stable.test(version),
        `${name}: stable latest must already exist before RC publication`,
      );
      return version;
    }),
  );
  assert(
    versions.length && versions.every((version) => version === versions[0]),
    "RC packages require one shared stable registry baseline",
  );
  return versions[0];
}

/** Validate the actual native Changesets plan before any archive is published. */
export function validatePublishPlan(plan, packages, { version, tag }) {
  assert.equal(plan.version, 1, "Unsupported Changesets publish plan");
  assert(Array.isArray(plan.plan), "Missing Changesets publish plan");
  const names = new Set(packages.map((pkg) => pkg.name));
  const seen = new Set();
  for (const entry of plan.plan.flat()) {
    assert(
      names.has(entry.name) && !seen.has(entry.name),
      "Unexpected or duplicate publication target",
    );
    seen.add(entry.name);
    assert.equal(
      entry.version,
      version,
      "Publish plan version differs from the verified source",
    );
    assert(
      entry.kind === "publish" || entry.kind === "tag-only",
      "Unknown publication operation",
    );
    if (entry.kind === "publish")
      assert.equal(
        entry.tag,
        tag,
        "Publish plan would change the wrong npm tag",
      );
  }
}
