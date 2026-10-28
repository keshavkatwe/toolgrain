import assert from "node:assert/strict";

const stable = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const candidate =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-rc\.(0|[1-9][0-9]*)$/;

/** Stable automation stays on main; RC publication is an explicit dispatch of a prepared branch. */
export function publicationPolicy(
  { version, packages },
  { ref, eventName, preState },
) {
  if (ref === "refs/heads/main") {
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
  assert(candidate.test(version), "RC publication requires X.Y.Z-rc.N");
  assert.equal(
    ref,
    `refs/heads/prerelease/${version}`,
    "RC branch must match the prepared version",
  );
  assert.equal(
    preState?.mode,
    "pre",
    "RC publication requires active prerelease state",
  );
  assert.equal(preState.tag, "rc", "RC publication uses only the rc npm tag");
  const versions = packages.map((pkg) => {
    assert.equal(
      pkg.publishConfig.tag,
      "rc",
      "RC manifests must use the rc npm tag",
    );
    return preState.initialVersions[pkg.name];
  });
  assert(
    versions.every(
      (version) => stable.test(version) && version === versions[0],
    ),
    "RC packages require one shared stable baseline",
  );
  return { version, tag: "rc", stableVersion: versions[0] };
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
