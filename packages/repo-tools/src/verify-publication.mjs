import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { checkRelease } from "./release.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const digest = (bytes, algorithm) =>
  `${algorithm}-${createHash(algorithm).update(bytes).digest("base64")}`;

/** Wait for both npm metadata representations used by fresh installers. */
export async function verifyPublishedPackage(
  { name, version },
  archive,
  { fetchImpl = fetch, attempts = 12, delay = () => setTimeout(10000) } = {},
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
          return response.json();
        },
      ),
    );
    if (
      responses.every(
        (body) =>
          body?.["dist-tags"]?.latest === version && body.versions?.[version],
      )
    ) {
      metadata = responses[0].versions[version];
      break;
    }
    if (attempt + 1 < attempts) await delay();
  }
  assert(
    metadata,
    `${name}@${version} is not available under latest in both npm metadata formats`,
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
    tag: "latest",
    integrity: metadata.dist.integrity,
    matchedArtifact: !!archive,
  };
}

export async function main(args = []) {
  const { values } = parseArgs({
    args,
    options: { "pack-dir": { type: "string" } },
  });
  assert(values["pack-dir"], "--pack-dir is required");
  const directory = values["pack-dir"];
  const { plan } = JSON.parse(
    readFileSync(join(directory, "publish-plan.json")),
  );
  const { packages } = checkRelease(root);
  const results = [];
  let failure;
  try {
    for (const pkg of packages) {
      const entry = plan.flat().find(({ name }) => name === pkg.name);
      const archive = entry?.tarball && {
        bytes: readFileSync(join(directory, entry.tarball.path)),
        integrity: entry.tarball.integrity,
      };
      console.log(`Verify npm latest and archive: ${pkg.name}@${pkg.version}`);
      results.push(await verifyPublishedPackage(pkg, archive));
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
