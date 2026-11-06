import assert from "node:assert/strict";

const stable = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const candidate =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-(alpha|beta|rc)\.(0|[1-9][0-9]*)$/;

export const prereleaseTags = Object.freeze(["alpha", "beta", "rc"]);

/** Stable automation stays on main; prereleases require an explicit dispatch of a prepared branch. */
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
      "Prerelease inputs cannot select stable publication on main",
    );
    assert(!preState, "Stable publication refuses Changesets prerelease state");
    assert(stable.test(version), "Main must contain a stable version");
    for (const pkg of packages) assert.equal(pkg.publishConfig.tag, "latest");
    return { version, tag: "latest", stableVersion: "" };
  }
  assert.equal(
    eventName,
    "workflow_dispatch",
    "Prerelease publication requires manual dispatch",
  );
  const release = candidate.exec(version);
  assert(
    release && release[0] === version,
    "Prerelease publication requires X.Y.Z-alpha.N, X.Y.Z-beta.N, or X.Y.Z-rc.N",
  );
  const tag = release[4];
  assert.equal(
    ref,
    `refs/heads/prerelease/${release[1]}.${release[2]}`,
    "Prerelease branch must match the prepared major/minor release series",
  );
  assert.equal(
    requestedVersion,
    version,
    "Manually confirm the exact prepared prerelease version",
  );
  assert(
    typeof expectedSha === "string" &&
      expectedSha.length === 40 &&
      /^[a-f0-9]{40}$/.test(expectedSha),
    "Prerelease publication requires a full expected commit SHA",
  );
  assert.equal(
    sourceSha,
    expectedSha,
    "The workflow commit differs from the approved prerelease commit",
  );
  assert.equal(
    preState?.mode,
    "pre",
    "Prerelease publication requires active prerelease state",
  );
  assert.equal(
    preState.tag,
    tag,
    "Prerelease state must match the version channel",
  );
  for (const pkg of packages) {
    assert.equal(
      pkg.publishConfig.tag,
      tag,
      "Prerelease manifests must use the version's npm tag",
    );
  }
  assert(
    typeof stableVersion === "string" && stable.test(stableVersion),
    "Prerelease publication requires a stable registry baseline",
  );
  return { version, tag, stableVersion };
}

/** Changesets 3 pre-state has only mode/tag; capture the actual shared npm latest separately. */
export async function stablePublicationBaseline(packages, fetchImpl = fetch) {
  return (await publicationBaselines(packages, [], fetchImpl)).stableVersion;
}

/** Explicit first-publication names never exempt an established package from its stable baseline. */
export function initialPublicationNames(packages, names) {
  assert(
    Array.isArray(names),
    "Initial publications must be a package-name array",
  );
  const known = new Set(packages.map(({ name }) => name));
  assert.equal(
    new Set(names).size,
    names.length,
    "Duplicate initial publication",
  );
  for (const name of names)
    assert(known.has(name), "Unknown initial publication package");
  return names;
}

/** Capture each package's latest tag, including an explicitly approved absence. */
export async function publicationBaselines(
  packages,
  initialPackages = [],
  fetchImpl = fetch,
) {
  initialPublicationNames(packages, initialPackages);
  const entries = await Promise.all(
    packages.map(async ({ name }) => {
      const readings = await Promise.all(
        ["application/json", "application/vnd.npm.install-v1+json"].map(
          async (accept) => {
            const response = await fetchImpl(
              `https://registry.npmjs.org/${encodeURIComponent(name)}`,
              { headers: { accept }, signal: AbortSignal.timeout(30000) },
            );
            const initial = initialPackages.includes(name);
            if (response.status === 404 && initial)
              return { latest: null, unpublished: true };
            assert(
              response.ok,
              `${name}: cannot read the stable registry baseline`,
            );
            const metadata = await response.json();
            const version = metadata["dist-tags"]?.latest;
            if (version === undefined && initial) {
              assert(
                metadata["dist-tags"] &&
                  metadata.versions &&
                  typeof metadata.versions === "object" &&
                  !Array.isArray(metadata.versions) &&
                  Object.keys(metadata.versions).every((value) =>
                    candidate.test(value),
                  ),
                `${name}: initial publication must not hide an established stable release`,
              );
              return {
                latest: null,
                unpublished: Object.keys(metadata.versions).length === 0,
              };
            }
            assert(
              typeof version === "string" && stable.test(version),
              `${name}: stable latest must already exist before prerelease publication`,
            );
            return { latest: version, unpublished: false };
          },
        ),
      );
      assert.deepEqual(
        readings[0],
        readings[1],
        `${name}: npm metadata formats disagree`,
      );
      return [name, readings[0].latest, readings[0].unpublished];
    }),
  );
  const versions = entries
    .map(([, version]) => version)
    .filter((value) => value !== null);
  assert(
    versions.length && versions.every((version) => version === versions[0]),
    "Prerelease packages require one shared stable registry baseline",
  );
  return {
    stableVersion: versions[0],
    latest: Object.fromEntries(
      entries.map(([name, version]) => [name, version]),
    ),
    unpublished: entries
      .filter(([, , unpublished]) => unpublished)
      .map(([name]) => name),
  };
}

/** Reject partial/foreign snapshots and unapproved missing latest tags. */
export function validateLatestBaselines(
  packages,
  latest,
  stableVersion,
  initialPackages = [],
) {
  assert(
    typeof stableVersion === "string" && stable.test(stableVersion),
    "Invalid stable baseline",
  );
  initialPublicationNames(packages, initialPackages);
  assert(
    latest && typeof latest === "object" && !Array.isArray(latest),
    "Invalid latest baselines",
  );
  assert.deepEqual(
    Object.keys(latest).sort(),
    packages.map(({ name }) => name).sort(),
    "Latest baselines must cover exactly the release group",
  );
  for (const { name } of packages)
    assert(
      latest[name] === stableVersion ||
        (latest[name] === null && initialPackages.includes(name)),
      `${name}: invalid latest baseline`,
    );
  assert(
    Object.values(latest).includes(stableVersion),
    "Missing established stable baseline",
  );
  return latest;
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
