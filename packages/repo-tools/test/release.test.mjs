import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkRelease, syncLockfile } from "../src/release.mjs";

function fixture(t, version = "0.1.0") {
  const directory = mkdtempSync(join(tmpdir(), "toolgrain-release-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const write = (path, value) =>
    writeFileSync(
      join(directory, path),
      typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
    );
  mkdirSync(join(directory, ".changeset"));
  write("package.json", {
    name: "fixture",
    private: true,
    workspaces: ["packages/*"],
  });
  write(".changeset/config.json", {
    changelog: false,
    commit: false,
    format: false,
    access: "public",
    fixed: [["@toolgrain/protocol", "@toolgrain/mcp"]],
    privatePackages: { version: true, tag: false },
    ignore: ["@toolgrain/repo-tools"],
  });
  const workspaces = { "": { name: "fixture" } };
  const packages = {};
  for (const short of ["protocol", "mcp", "repo-tools"]) {
    mkdirSync(join(directory, "packages", short), { recursive: true });
    const manifest = {
      name: `@toolgrain/${short}`,
      version: short === "repo-tools" ? "0.0.0" : version,
      ...(short === "repo-tools"
        ? { private: true }
        : {
            publishConfig: {
              access: "public",
              registry: "https://registry.npmjs.org/",
            },
          }),
      ...(short === "mcp"
        ? { dependencies: { "@toolgrain/protocol": "workspace:*" } }
        : {}),
    };
    write(`packages/${short}/package.json`, manifest);
    workspaces[`packages/${short}`] = manifest;
    packages[manifest.name] = [`${manifest.name}@workspace:packages/${short}`];
  }
  write("bun.lock", {
    lockfileVersion: 1,
    configVersion: 1,
    workspaces,
    packages,
  });
  return { directory, write };
}

const cli = new URL(
  "../../../node_modules/@changesets/cli/bin.js",
  import.meta.url,
).pathname;

test("alignment catches manifest drift, stale lock metadata, and a mismatched requested version", (t) => {
  const { directory, write } = fixture(t);
  assert.equal(checkRelease(directory).version, "0.1.0");
  assert.throws(() => checkRelease(directory, "0.2.0"), /shared version/);
  const manifest = JSON.parse(
    readFileSync(join(directory, "packages/mcp/package.json")),
  );
  write("packages/mcp/package.json", { ...manifest, version: "0.2.0" });
  assert.throws(() => checkRelease(directory), /shared version/);
  write("packages/mcp/package.json", manifest);
  const lock = readFileSync(join(directory, "bun.lock"), "utf8");
  write("bun.lock", lock.replace('"version": "0.1.0"', '"version": "0.0.0"'));
  assert.throws(() => checkRelease(directory), /Bun workspace versions/);
  syncLockfile(directory);
  assert.equal(readFileSync(join(directory, "bun.lock"), "utf8"), lock);
  write(
    "bun.lock",
    lock.replace('"packages/protocol":', '"packages/unknown":'),
  );
  assert.throws(() => syncLockfile(directory), /Missing or ambiguous/);
});

test("Changesets and the Bun workaround produce archives with the aligned dependency versions", (t) => {
  const { directory, write } = fixture(t);
  const lock = readFileSync(join(directory, "bun.lock"), "utf8");
  write(
    ".changeset/feature.md",
    '---\n"@toolgrain/mcp": minor\n---\nA new capability.\n',
  );
  execFileSync("node", [cli, "version"], { cwd: directory, timeout: 30000 });
  syncLockfile(directory);
  const state = checkRelease(directory, "0.2.0");
  assert.equal(state.packages.length, 2);
  assert.equal(
    readFileSync(join(directory, "bun.lock"), "utf8"),
    lock.replaceAll('"version": "0.1.0"', '"version": "0.2.0"'),
  );
  assert.equal(
    JSON.parse(
      readFileSync(join(directory, "packages/repo-tools/package.json")),
    ).version,
    "0.0.0",
  );
  const archive = join(directory, "mcp.tgz");
  execFileSync(
    "bun",
    ["pm", "pack", "--ignore-scripts", "--quiet", "--filename", archive],
    { cwd: join(directory, "packages/mcp"), timeout: 10000 },
  );
  const packed = JSON.parse(
    execFileSync("tar", ["-xOf", archive, "package/package.json"], {
      encoding: "utf8",
    }),
  );
  assert.equal(packed.version, "0.2.0");
  assert.equal(packed.dependencies["@toolgrain/protocol"], "0.2.0");
});

test("the initial empty record preserves 0.1.0 and does not generate package changelogs", (t) => {
  const { directory, write } = fixture(t);
  write(".changeset/initial.md", "---\n\n---\n");
  execFileSync("node", [cli, "version"], { cwd: directory, timeout: 30000 });
  syncLockfile(directory);
  assert.equal(checkRelease(directory).version, "0.1.0");
  assert(!existsSync(join(directory, ".changeset/initial.md")));
  for (const name of ["protocol", "mcp"])
    assert(!existsSync(join(directory, "packages", name, "CHANGELOG.md")));
});

test("the initial RC series stays in its fixed group and promotes to 0.1.0", (t) => {
  const { directory, write } = fixture(t, "0.0.0");
  const changeset = (type) =>
    `---\n"@toolgrain/mcp": ${type}\n---\nCandidate release.\n`;
  const run = (...args) =>
    execFileSync("node", [cli, ...args], { cwd: directory, timeout: 30000 });
  const assertVersion = (version) => {
    syncLockfile(directory);
    assert.equal(checkRelease(directory, version).packages.length, 2);
  };

  write(".changeset/initial-release.md", changeset("minor"));
  run("pre", "enter", "rc");
  run("version");
  assertVersion("0.1.0-rc.0");
  assert(existsSync(join(directory, ".changeset/pre/initial-release.md")));

  const archive = join(directory, "candidate.tgz");
  execFileSync(
    "bun",
    ["pm", "pack", "--ignore-scripts", "--quiet", "--filename", archive],
    { cwd: join(directory, "packages/mcp"), timeout: 10000 },
  );
  const packed = JSON.parse(
    execFileSync("tar", ["-xOf", archive, "package/package.json"], {
      encoding: "utf8",
    }),
  );
  assert.equal(packed.version, "0.1.0-rc.0");
  assert.equal(packed.dependencies["@toolgrain/protocol"], "0.1.0-rc.0");

  write(".changeset/candidate-fix.md", changeset("patch"));
  run("version");
  assertVersion("0.1.0-rc.1");
  run("pre", "exit");
  run("version");
  assertVersion("0.1.0");
  assert(!existsSync(join(directory, ".changeset/pre.json")));
  assert(!existsSync(join(directory, ".changeset/pre/initial-release.md")));
  assert.equal(
    JSON.parse(
      readFileSync(join(directory, "packages/repo-tools/package.json")),
    ).version,
    "0.0.0",
  );
});
