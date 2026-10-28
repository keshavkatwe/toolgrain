import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkSupportResults } from "../src/ci-gate.mjs";
import {
  classifyChanges,
  editorialManifest,
  planChecks,
} from "../src/ci-plan.mjs";

test("CI scopes only explicitly editorial changes; mixed and unknown changes retain full checks", () => {
  for (const path of [
    "README.md",
    "docs/tools/overview.mdx",
    "brand/logo.svg",
    ".changeset/example.md",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    "apps/http-example/README.md",
  ])
    assert.equal(classifyChanges([path]).profile, "docs", path);
  for (const path of [
    "packages/mcp/README.md",
    "packages/protocol/NOTICE",
    "packages/node/CHANGELOG.md",
  ])
    assert.equal(classifyChanges([path]).profile, "package", path);
  for (const path of [
    "bun.lock",
    "package.json",
    "support-policy.json",
    "packages/mcp/src/server.ts",
    "apps/http-example/src/index.ts",
    ".github/workflows/ci.yml",
    "packages/repo-tools/src/ci-plan.mjs",
    "unknown-file",
    "docs.md\nsource.ts",
  ])
    assert.equal(
      classifyChanges(["docs/index.mdx", path]).profile,
      "full",
      path,
    );
  assert.equal(classifyChanges([]).profile, "full");
  assert.deepEqual(
    classifyChanges(["packages/mcp/README.md", "docs/index.mdx"]),
    { profile: "package", docs: true },
  );
});

test("package metadata stays light only when runtime and packaging contracts are unchanged", () => {
  const before = {
    name: "@toolgrain/mcp",
    version: "0.1.2",
    homepage: "old",
    exports: "./dist/index.js",
    engines: { node: "^24.20.0" },
  };
  assert(
    editorialManifest(before, {
      ...before,
      homepage: "new",
      description: "New wording",
      keywords: ["mcp"],
    }),
  );
  for (const changed of [
    { version: "0.1.3" },
    { exports: "./wrong.js" },
    { engines: { node: ">=26" } },
    { dependencies: { zod: "*" } },
    { files: ["src"] },
  ])
    assert.equal(editorialManifest(before, { ...before, ...changed }), false);
  assert.equal(classifyChanges(["packages/mcp/package.json"]).profile, "full");
  assert.equal(
    classifyChanges(["packages/mcp/package.json"], () => true).profile,
    "package",
  );
});

test("CI planning uses real history, includes both rename paths, and falls back safely", () => {
  const cwd = mkdtempSync(join(tmpdir(), "toolgrain-ci-plan-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const write = (path, content) => {
    mkdirSync(join(cwd, path, ".."), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  const commit = () => {
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    );
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "-q");
    write(
      "packages/mcp/package.json",
      JSON.stringify({ name: "@toolgrain/mcp", homepage: "old" }),
    );
    write("packages/mcp/src/server.ts", "export const value = 1;\n");
    const base = commit();
    write(
      "packages/mcp/package.json",
      JSON.stringify({ name: "@toolgrain/mcp", homepage: "new" }),
    );
    let head = commit();
    const event = () => ({ before: base, after: head, ref: "refs/heads/main" });
    assert.equal(
      planChecks({ cwd, eventName: "push", event: event() }).profile,
      "package",
    );
    assert.equal(
      planChecks({
        cwd,
        eventName: "pull_request",
        event: { pull_request: { base: { sha: base }, head: { sha: head } } },
      }).profile,
      "package",
    );
    assert.equal(
      planChecks({ cwd, eventName: "push", event: event(), full: true })
        .profile,
      "full",
    );
    mkdirSync(join(cwd, "docs"));
    renameSync(
      join(cwd, "packages/mcp/src/server.ts"),
      join(cwd, "docs/server.mdx"),
    );
    head = commit();
    assert.equal(
      planChecks({ cwd, eventName: "push", event: event() }).profile,
      "full",
    );
    for (const options of [
      { eventName: "push", event: { ...event(), before: "0".repeat(40) } },
      { eventName: "push", event: { ...event(), before: "f".repeat(40) } },
      {
        eventName: "push",
        event: { ...event(), before: "--output=unexpected" },
      },
      { eventName: "push", event: { ...event(), ref: "refs/tags/v1" } },
      { eventName: "workflow_dispatch", event: {} },
      { eventName: "schedule", event: {} },
    ])
      assert.deepEqual(planChecks({ cwd, ...options }), {
        profile: "full",
        docs: true,
      });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("the support gate rejects missing, cancelled and skipped required jobs without blocking on previews", () => {
  const needs = (profile) => ({
    plan: { result: "success", outputs: { profile } },
    compatibility: { result: "skipped" },
    declarations: { result: "skipped" },
    "typescript-versions": { result: "skipped" },
    "intermediate-types": { result: "skipped" },
    upstream: { result: "skipped" },
    preview: { result: "failure" },
    canary: { result: "cancelled" },
  });
  for (const profile of ["docs", "package"])
    assert.doesNotThrow(() => checkSupportResults(needs(profile)));
  assert.throws(() => checkSupportResults(needs("unknown")));
  assert.throws(() =>
    checkSupportResults({ ...needs("docs"), plan: { result: "failure" } }),
  );
  const full = {
    ...needs("full"),
    compatibility: { result: "success" },
    declarations: { result: "success" },
  };
  assert.doesNotThrow(() => checkSupportResults(full));
  for (const name of ["compatibility", "declarations"])
    for (const result of ["failure", "cancelled", "skipped", undefined])
      assert.throws(() => checkSupportResults({ ...full, [name]: { result } }));
  assert.throws(() => checkSupportResults(full, true));
  for (const name of ["typescript-versions", "intermediate-types", "upstream"])
    full[name] = { result: "success" };
  assert.doesNotThrow(() => checkSupportResults(full, true));
});

test("workflow wiring preserves release gates, skips duplicate main runs and keeps previews off releases", () => {
  const root = new URL("../../../", import.meta.url);
  const load = (name) =>
    Bun.YAML.parse(
      readFileSync(new URL(`.github/workflows/${name}.yml`, root), "utf8"),
    );
  const ci = load("ci"),
    support = load("support"),
    release = load("release"),
    publish = load("publish");
  for (const workflow of [ci, support]) {
    assert(!workflow.on.push.branches);
    assert(workflow.on.pull_request !== undefined);
    assert.deepEqual(workflow.on.push.tags, ["v*"]);
  }
  assert.equal(release.jobs.baseline.with.full, true);
  assert.equal(release.jobs.support.with.full, true);
  for (const name of ["main-checks", "main-support"])
    assert.equal(
      publish.jobs[name].if,
      "needs.select-mode.outputs.mode != 'publish' && github.ref == 'refs/heads/main'",
    );
  assert.equal(
    publish.jobs.verify.if,
    "needs.select-mode.outputs.mode == 'publish'",
  );
  assert.deepEqual(publish.jobs.pack.needs, ["select-mode", "verify"]);
  assert.deepEqual(publish.jobs.publish.needs, ["select-mode", "pack"]);
  assert.equal(publish.jobs.publish.environment, "npm");
  assert.equal(publish.jobs.publish.permissions["id-token"], "write");
  assert.deepEqual(publish.jobs.registry.needs, [
    "select-mode",
    "pack",
    "publish",
  ]);
  assert.match(publish.jobs["select-mode"].if, /workflow_dispatch/);
  assert.match(publish.jobs["select-mode"].if, /refs\/heads\/prerelease\//);
  assert(
    publish.jobs.publish.steps.some(({ run }) =>
      run?.includes("validatePublishPlan"),
    ),
  );
  assert(
    publish.jobs.registry.steps.some(({ run }) =>
      run?.includes("--preserve-latest"),
    ),
  );
  assert.equal(publish.jobs.consumers.needs, "registry");
  assert.equal(support.jobs.required.name, "Support checks");
  assert.match(support.jobs.required.if, /^\$\{\{ always\(\) \}\}$/);
  assert.deepEqual(
    support.jobs.required.needs.toSorted(),
    Object.keys(support.jobs)
      .filter((name) => name !== "required")
      .toSorted(),
  );
  for (const name of ["preview", "canary"]) {
    assert.equal(support.jobs[name]["continue-on-error"], true);
    assert(!support.jobs[name].if.includes("inputs.full"));
    assert(support.jobs[name].if.includes("schedule"));
    assert(support.jobs[name].if.includes("workflow_dispatch"));
  }
  assert.equal(support.jobs.compatibility.strategy.matrix.include.length, 7);
  assert(
    !support.jobs.compatibility.strategy.matrix.include.some(
      ({ preview }) => preview,
    ),
  );
  for (const name of ["compatibility", "declarations", "intermediate-types"])
    assert(
      support.jobs[name].steps.some(({ run }) =>
        run?.includes(
          name === "compatibility" ? "--checks=runtime" : "--checks=types",
        ),
      ),
    );
});
