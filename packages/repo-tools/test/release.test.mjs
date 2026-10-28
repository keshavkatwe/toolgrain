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
    packageManager: "bun@1.3.14",
    devEngines: { packageManager: { name: "bun", version: "1.3.14" } },
  });
  write(".changeset/config.json", {
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
  assert.match(
    readFileSync(join(directory, "packages/mcp/CHANGELOG.md"), "utf8"),
    /0\.2\.0[\s\S]*A new capability/,
  );
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

test("an empty record preserves 0.1.0 without creating a release", (t) => {
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

for (const prerelease of [false, true])
  test(`native Changesets plans, packs and publishes ${prerelease ? "RC" : "stable"} artifacts and package tags`, (t) => {
    const expectedVersion = prerelease ? "0.1.1-rc.0" : "0.1.1";
    const expectedTag = prerelease ? "rc" : "latest";
    const { directory, write } = fixture(t);
    write(
      ".changeset/fix.md",
      '---\n"@toolgrain/mcp": patch\n---\nFix the consumer flow.\n',
    );
    const log = join(directory, "npm-calls.jsonl");
    const fakeNpm = join(directory, "npm-cli.cjs");
    writeFileSync(
      fakeNpm,
      `
    const fs = require('node:fs');
    const [command, ...args] = process.argv.slice(2);
    fs.appendFileSync(process.env.TOOLGRAIN_TEST_LOG, JSON.stringify({ command, args, cwd: process.cwd() }) + '\\n');
    if (command === 'info') console.log(JSON.stringify({ name: args[0], versions: ['0.1.0'], 'dist-tags': { latest: '0.1.0' } }));
    else if (command === 'publish') {
      if (!args[0].endsWith('.tgz') || !fs.existsSync(args[0])) process.exit(2);
      if (process.env.TOOLGRAIN_TEST_FAIL) { console.log(JSON.stringify({ error: { code: 'E403', summary: 'Denied' } })); process.exit(1); }
      console.log('{}');
    } else process.exit(3);
  `,
    );
    const shim = new URL("../bin/changesets/", import.meta.url).pathname;
    const env = {
      ...process.env,
      PATH: `${shim}:${process.env.PATH}`,
      TOOLGRAIN_NPM_CLI: fakeNpm,
      TOOLGRAIN_TEST_LOG: log,
    };
    const run = (...args) =>
      execFileSync("node", [cli, ...args], {
        cwd: directory,
        env,
        timeout: 30000,
      });
    execFileSync("git", ["init", "-q"], { cwd: directory });
    execFileSync("git", ["add", "."], { cwd: directory });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "-qm",
        "fixture",
      ],
      { cwd: directory },
    );
    env.GIT_COMMITTER_NAME = "Fixture";
    env.GIT_COMMITTER_EMAIL = "fixture@example.invalid";
    if (prerelease) run("pre", "enter", "rc");
    run("version");
    syncLockfile(directory);
    assert.equal(checkRelease(directory).version, expectedVersion);
    run("publish-plan", "--output", join(directory, "plan.json"));
    const plan = JSON.parse(
      readFileSync(join(directory, "plan.json")),
    ).plan.flat();
    assert.equal(plan.length, 2);
    assert(
      plan.every(
        ({ kind, version, tag }) =>
          kind === "publish" &&
          version === expectedVersion &&
          tag === expectedTag,
      ),
    );
    const packedDirectory = join(directory, "packed");
    run(
      "pack",
      "--from-publish-plan",
      join(directory, "plan.json"),
      "--out-dir",
      packedDirectory,
    );
    const packed = JSON.parse(
      readFileSync(join(packedDirectory, "publish-plan.json")),
    ).plan.flat();
    for (const entry of packed) {
      assert.match(entry.tarball.integrity, /^sha256-/);
      const manifest = JSON.parse(
        execFileSync(
          "tar",
          [
            "-xOf",
            join(packedDirectory, entry.tarball.path),
            "package/package.json",
          ],
          { encoding: "utf8" },
        ),
      );
      assert.equal(manifest.version, expectedVersion);
      if (entry.name === "@toolgrain/mcp")
        assert.equal(
          manifest.dependencies["@toolgrain/protocol"],
          expectedVersion,
        );
    }
    // A failed publish must fail the native command and create no success tags.
    env.TOOLGRAIN_TEST_FAIL = "true";
    assert.throws(() => run("publish", "--from-pack-dir", packedDirectory));
    assert.equal(
      execFileSync("git", ["tag"], { cwd: directory, encoding: "utf8" }).trim(),
      "",
    );
    delete env.TOOLGRAIN_TEST_FAIL;
    env.CHANGESETS_OUTPUT = join(directory, "output.jsonl");
    run("publish", "--from-pack-dir", packedDirectory);
    const tags = execFileSync("git", ["tag"], {
      cwd: directory,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    assert.deepEqual(tags.sort(), [
      `@toolgrain/mcp@${expectedVersion}`,
      `@toolgrain/protocol@${expectedVersion}`,
    ]);
    const events = readFileSync(env.CHANGESETS_OUTPUT, "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(events.filter(({ type }) => type === "git-tag").length, 2);
    const calls = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    assert(
      calls.every(
        ({ cwd }) =>
          cwd !== directory && !cwd.startsWith(`${directory}/packages/`),
      ),
    );
    assert(
      calls
        .filter(({ command }) => command === "publish")
        .every(
          ({ args }) =>
            args.includes("--ignore-scripts") && args.includes(expectedTag),
        ),
    );
  });
