import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  initialPublicationArchive,
  readInitialLatest,
  readInitialPublications,
} from "./initial-publications.mjs";
import {
  prereleaseTags,
  validateLatestBaselines,
} from "./publication-policy.mjs";
import { checkRelease } from "./release.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const digest = (bytes, algorithm) =>
  `${algorithm}-${createHash(algorithm).update(bytes).digest("base64")}`;

/** Wait for both npm metadata representations used by fresh installers. */
export async function verifyPublishedPackage(
  { name, version },
  archive,
  {
    fetchImpl = fetch,
    attempts = 12,
    delay = () => setTimeout(10000),
    tag = "latest",
    expectedLatest,
  } = {},
) {
  const endpoint = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  let metadata;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const responses = await Promise.all(
      ["application/json", "application/vnd.npm.install-v1+json"].map(
        async (accept) => {
          const response = await fetchImpl(endpoint, {
            headers: { accept },
            signal: AbortSignal.timeout(30000),
          });
          if (
            response.status === 404 ||
            response.status === 429 ||
            response.status >= 500
          )
            return undefined;
          assert(response.ok, `npm metadata failed: ${response.status}`);
          const metadata = await response.json();
          if (expectedLatest !== undefined)
            assert.equal(
              metadata["dist-tags"]?.latest ?? null,
              expectedLatest,
              `${name}: stable latest changed during prerelease verification`,
            );
          return metadata;
        },
      ),
    );
    if (
      responses.every(
        (body) =>
          body?.["dist-tags"]?.[tag] === version && body.versions?.[version],
      )
    ) {
      metadata = responses[0].versions[version];
      break;
    }
    if (attempt + 1 < attempts) await delay();
  }
  assert(
    metadata,
    `${name}@${version} is not available under ${tag} in both npm metadata formats`,
  );
  assert.equal(metadata.name, name);
  assert.equal(metadata.version, version);
  const url = new URL(metadata.dist.tarball);
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "registry.npmjs.org");
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000) });
  assert(response.ok, `npm archive failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(
    digest(bytes, "sha512"),
    metadata.dist.integrity,
    `${name}: registry integrity mismatch`,
  );
  if (archive) {
    assert.equal(
      digest(bytes, "sha256"),
      archive.integrity,
      `${name}: published bytes differ from the Changesets artifact`,
    );
    assert.deepEqual(
      bytes,
      archive.bytes,
      `${name}: downloaded archive differs from the packed archive`,
    );
  }
  return {
    name,
    version,
    tag,
    integrity: metadata.dist.integrity,
    matchedArtifact: !!archive,
  };
}

export async function main(args = []) {
  const { values } = parseArgs({
    args,
    options: {
      "pack-dir": { type: "string" },
      tag: { type: "string", default: "latest" },
      "preserve-latest": { type: "string" },
      "latest-baselines": { type: "string" },
      "initial-directory": { type: "string" },
      "source-sha": { type: "string" },
    },
  });
  assert(values["pack-dir"], "--pack-dir is required");
  assert(
    values.tag === "latest" || prereleaseTags.includes(values.tag),
    "Unsupported publication tag",
  );
  assert(
    values.tag === "latest" || values["preserve-latest"],
    "Prerelease verification requires --preserve-latest",
  );
  const directory = values["pack-dir"];
  const { plan } = JSON.parse(
    readFileSync(join(directory, "publish-plan.json")),
  );
  const { packages } = checkRelease(root);
  if (values["initial-directory"])
    assert(
      /^[a-f0-9]{40}$/.test(values["source-sha"]),
      "Initial publication requires the full source SHA",
    );
  const initialPackages = readInitialPublications(root, packages);
  const latest =
    values.tag !== "latest" && values["latest-baselines"]
      ? validateLatestBaselines(
          packages,
          JSON.parse(values["latest-baselines"]),
          values["preserve-latest"],
          initialPackages,
          readInitialLatest(root),
        )
      : undefined;
  const results = [];
  let failure;
  try {
    for (const pkg of packages) {
      const entry = plan.flat().find(({ name }) => name === pkg.name);
      const plannedArchive = entry?.tarball && {
        bytes: readFileSync(join(directory, entry.tarball.path)),
        integrity: entry.tarball.integrity,
      };
      const initialArchive = values["initial-directory"]
        ? initialPublicationArchive(
            values["initial-directory"],
            pkg,
            values["source-sha"],
          )
        : undefined;
      if (values["initial-directory"] && initialPackages.includes(pkg.name))
        assert(
          initialArchive,
          `${pkg.name}: missing reviewed initial publication archive`,
        );
      if (plannedArchive && initialArchive)
        assert.deepEqual(
          plannedArchive.bytes,
          initialArchive.bytes,
          "Initial archive differs from the Changesets artifact",
        );
      const archive = plannedArchive || initialArchive;
      console.log(
        `Verify npm ${values.tag} and archive: ${pkg.name}@${pkg.version}`,
      );
      results.push(
        await verifyPublishedPackage(pkg, archive, {
          tag: values.tag,
          expectedLatest: latest
            ? latest[pkg.name]
            : values["preserve-latest"] || undefined,
        }),
      );
    }
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(
      join(root, "reports/publication.json"),
      `${JSON.stringify({ status: failure ? "failed" : "passed", ...(failure ? { error: failure.message } : {}), results }, null, 2)}\n`,
    );
  }
}
