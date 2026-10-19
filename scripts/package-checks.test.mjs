import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { semver } from "bun";
import { auditFindings, dependencyGraph, parseAudit } from "./audit-graph.mjs";
import { checkSize } from "./package-size.mjs";

const advisory = {
  id: 1,
  severity: "high",
  title: "Example advisory",
  url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
  vulnerable_versions: "<2.0.0",
};
const entry = (name, version, metadata = {}) => [
  `${name}@${version}`,
  "",
  metadata,
];

test("attributes nested versions, workspace runtime dependencies and direct dev tooling separately", () => {
  const lock = {
    workspaces: {
      "": { name: "root", devDependencies: { tooling: "1.0.0" } },
      "packages/library": {
        name: "@test/core",
        dependencies: { parent: "1.0.0", "@test/protocol": "workspace:*" },
        devDependencies: { tooling: "1.0.0" },
      },
      "packages/protocol": {
        name: "@test/protocol",
        dependencies: { safe: "2.0.0" },
        devDependencies: { unrelated: "1.0.0" },
      },
    },
    packages: {
      parent: entry("parent", "1.0.0", { dependencies: { affected: "1.0.0" } }),
      "parent/affected": entry("affected", "1.0.0"),
      affected: entry("affected", "2.0.0"),
      safe: entry("safe", "2.0.0"),
      tooling: entry("tooling", "1.0.0", {
        dependencies: { affected: "2.0.0" },
      }),
      unrelated: entry("unrelated", "1.0.0"),
      "@test/protocol": entry("@test/protocol", "workspace:packages/protocol"),
    },
  };
  const runtime = dependencyGraph(lock, "packages/library");
  assert.deepEqual([...runtime.get("affected")], ["1.0.0"]);
  assert.ok(runtime.has("safe"));
  assert.ok(!runtime.has("tooling"));
  const all = dependencyGraph(lock, "packages/library", true);
  assert.deepEqual([...all.get("affected")], ["1.0.0", "2.0.0"]);
  assert.ok(!all.has("unrelated"));
  assert.deepEqual(
    auditFindings(all, { affected: [advisory] }, semver.satisfies)[0].versions,
    ["1.0.0"],
  );
  assert.equal(
    auditFindings(
      dependencyGraph(lock, ""),
      { affected: [advisory] },
      semver.satisfies,
    ).length,
    0,
  );
});

test("handles scoped hoisting, cycles and absent optional peers without hiding unresolved dependencies", () => {
  const lock = {
    workspaces: { "": { name: "root", dependencies: { "@scope/a": "1.0.0" } } },
    packages: {
      "@scope/a": entry("@scope/a", "1.0.0", {
        dependencies: { b: "1.0.0" },
        peerDependencies: { missing: "*" },
        optionalPeers: ["missing"],
      }),
      "@scope/a/b": entry("b", "1.0.0", {
        dependencies: { "@scope/a": "1.0.0" },
      }),
    },
  };
  assert.equal(dependencyGraph(lock, "").size, 2);
  delete lock.packages["@scope/a/b"];
  assert.throws(
    () => dependencyGraph(lock, ""),
    /Unresolved locked dependency/,
  );
});

test("rejects unavailable, malformed and ambiguous audit responses", () => {
  assert.deepEqual(parseAudit("{}", 0), {});
  assert.deepEqual(parseAudit(JSON.stringify({ dependency: [advisory] }), 1), {
    dependency: [advisory],
  });
  for (const [body, status] of [
    ["", 1],
    ["{}", 1],
    ["{}", null],
    ["[]", 0],
    ['{"error":"unavailable"}', 1],
    ['{"pkg":[{"severity":"unknown"}]}', 1],
  ])
    assert.throws(() => parseAudit(body, status));
});

test("enforces both size budgets, expected artifacts and package file boundaries", () => {
  const files = [
    { path: "dist/index.js", bytes: 10 },
    { path: "dist/index.d.ts", bytes: 20 },
  ];
  const budget = { packedBytes: 20, unpackedBytes: 30 };
  assert.equal(checkSize(files, 20, budget).status, "passed");
  assert.equal(checkSize(files, 21, budget).status, "failed");
  assert.equal(
    checkSize(files, 20, { ...budget, unpackedBytes: 29 }).status,
    "failed",
  );
  assert.match(
    checkSize([], 0, budget).errors.join(),
    /Missing required package file: dist\/index.js/,
  );
  for (const path of [
    ".env",
    "src/index.ts",
    "dist/.env",
    "dist/../secret.js",
    "dist/nested/.env",
    "dist/test.txt",
  ])
    assert.match(
      checkSize([...files, { path, bytes: 0 }], 20, budget).errors.join(),
      /Unexpected package file/,
    );
  assert.equal(
    checkSize(
      [...files, { path: "dist/vendor/2026-07-28/schema.ts", bytes: 0 }],
      20,
      budget,
    ).status,
    "passed",
  );
  assert.throws(() => checkSize(files, 20, {}), /Invalid size budget/);
  const danglingExports = checkSize(files, 20, budget, {
    exports: {
      "./missing": {
        types: "./dist/missing.d.ts",
        import: "./dist/missing.js",
      },
    },
  });
  assert.ok(
    danglingExports.errors.includes(
      "Missing required package file: dist/missing.js",
    ),
  );
  assert.ok(
    danglingExports.errors.includes(
      "Missing required package file: dist/missing.d.ts",
    ),
  );
});

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "toolgrain-checks-"));
  const write = (path, data, mode) => {
    const target = join(root, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(
      target,
      typeof data === "string" ? data : JSON.stringify(data),
      { mode },
    );
  };
  try {
    run({ root, write });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("real packing produces a report and rejects unexpected contents without publishing", () => {
  fixture(({ root, write }) => {
    write("package.json", {
      name: "@toolgrain/mcp",
      version: "0.0.0",
      private: true,
      files: ["dist", "secret.txt"],
    });
    write("dist/index.js", "export {};\n");
    write("dist/index.d.ts", "export {};\n");
    write("secret.txt", "unexpected package content");
    const result = spawnSync(
      process.execPath,
      [new URL("./package-size.mjs", import.meta.url).pathname],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(
      readFileSync(join(root, "reports/size.json"), "utf8"),
    );
    assert.ok(report.packedBytes > 0);
    assert.match(report.errors.join(), /Unexpected package file: secret.txt/);
  });
});

test("packed protocol archives must retain exports, internal modules and both revisions' vendor artifacts", () => {
  fixture(({ root, write }) => {
    const manifest = {
      name: "@toolgrain/protocol",
      version: "0.0.0",
      private: true,
      exports: {
        ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
        "./2025-06-18": {
          types: "./dist/legacy.d.ts",
          import: "./dist/legacy.js",
        },
      },
      files: ["dist"],
    };
    const files = [
      "dist/index.js",
      "dist/index.d.ts",
      "dist/legacy.js",
      "dist/legacy.d.ts",
      "dist/shared.js",
      "dist/shared.d.ts",
    ];
    for (const revision of ["2026-07-28", "2025-06-18"]) {
      for (const name of ["schema.ts", "provenance.json", "LICENSE"])
        files.push(`dist/vendor/${revision}/${name}`);
    }
    for (const path of files) write(path, "fixture\n");
    const execute = (included, expectedExit) => {
      write("package.json", { ...manifest, files: included });
      const result = spawnSync(
        process.execPath,
        [new URL("./package-size.mjs", import.meta.url).pathname],
        { cwd: root, encoding: "utf8", timeout: 60_000 },
      );
      assert.equal(result.status, expectedExit, result.stderr);
      return JSON.parse(readFileSync(join(root, "reports/size.json"), "utf8"));
    };
    assert.equal(execute(["dist"], 0).status, "passed");
    const rootsOnly = execute(["dist/index.js", "dist/index.d.ts"], 1);
    assert.ok(
      rootsOnly.errors.includes(
        "Missing required package file: dist/legacy.js",
      ),
    );
    assert.ok(
      rootsOnly.errors.includes(
        "Missing required package file: dist/legacy.d.ts",
      ),
    );
    const compiledOnly = execute(["dist/**/*.js", "dist/**/*.d.ts"], 1);
    for (const path of files.filter((path) =>
      path.startsWith("dist/vendor/"),
    )) {
      assert.ok(
        compiledOnly.errors.includes(`Missing required package file: ${path}`),
      );
    }
    assert.deepEqual(
      execute(
        files.filter((path) => path !== "dist/shared.js"),
        1,
      ).errors,
      ["Missing required package file: dist/shared.js"],
    );
  });
});

test("library size reports still run after an unrelated application build fails", () => {
  const repo = new URL("../", import.meta.url);
  const workflow = readFileSync(
    new URL(".github/workflows/ci.yml", repo),
    "utf8",
  );
  const step = workflow
    .split(/\n {6}- name: /)
    .find((part) => /\n {8}id: size\n/.test(part));
  // This gate must allow install=success/build=failure, while still honoring cancellation.
  assert.match(
    step,
    /if: \$\{\{ !cancelled\(\) && steps\.install\.outcome == 'success' \}\}/,
  );
  fixture(({ root, write }) => {
    const scripts = JSON.parse(
      readFileSync(new URL("package.json", repo), "utf8"),
    ).scripts;
    write("package.json", {
      name: "fixture",
      private: true,
      packageManager: "bun@1.3.14",
      workspaces: ["packages/*", "apps/*"],
      scripts: { build: scripts.build, "test:size": scripts["test:size"] },
    });
    write("turbo.json", readFileSync(new URL("turbo.json", repo), "utf8"));
    write(".gitignore", "node_modules/\ndist/\n.turbo/\nreports/\n");
    write(
      "package-size.config.json",
      readFileSync(new URL("package-size.config.json", repo), "utf8"),
    );
    write(
      "scripts/package-size.mjs",
      readFileSync(new URL("scripts/package-size.mjs", repo), "utf8"),
    );
    const library = {
      name: "@toolgrain/mcp",
      version: "0.0.0",
      private: true,
      files: ["dist"],
      scripts: {
        build: "node build.mjs",
        "test:size": "bun ../../scripts/package-size.mjs",
      },
    };
    const app = {
      name: "@test/broken-app",
      version: "0.0.0",
      dependencies: { "@toolgrain/mcp": "workspace:*" },
      scripts: { build: "node -e 'process.exit(1)'" },
    };
    write("packages/library/package.json", library);
    write(
      "packages/library/build.mjs",
      'import {mkdirSync,writeFileSync} from "node:fs";mkdirSync("dist",{recursive:true});for(const name of ["index.js","index.d.ts"])writeFileSync("dist/"+name,"export {};\\n");',
    );
    write("apps/broken/package.json", app);
    write("bun.lock", {
      lockfileVersion: 1,
      configVersion: 1,
      workspaces: {
        "": { name: "fixture" },
        "packages/library": library,
        "apps/broken": app,
      },
      packages: {
        "@toolgrain/mcp": entry("@toolgrain/mcp", "workspace:packages/library"),
        "@test/broken-app": entry("@test/broken-app", "workspace:apps/broken"),
      },
    });
    mkdirSync(join(root, "node_modules/.bin"), { recursive: true });
    symlinkSync(
      new URL("node_modules/.bin/turbo", repo).pathname,
      join(root, "node_modules/.bin/turbo"),
    );
    const execute = (script) =>
      spawnSync("bun", ["run", script], {
        cwd: root,
        encoding: "utf8",
        timeout: 60_000,
      });
    assert.equal(execute("build").status, 1);
    const size = execute("test:size");
    assert.equal(size.status, 0, `${size.stdout}\n${size.stderr}`);
    assert.equal(
      JSON.parse(
        readFileSync(join(root, "packages/library/reports/size.json"), "utf8"),
      ).status,
      "passed",
    );
  });
});

test("audit command writes per-workspace results and fails on high findings or service errors", () => {
  fixture(({ root, write }) => {
    const lock = {
      workspaces: {
        "": { name: "fixture" },
        "packages/library": {
          name: "@test/core",
          devDependencies: { affected: "1.0.0" },
        },
      },
      packages: { affected: entry("affected", "1.0.0") },
    };
    write("bun.lock", lock);
    write("package.json", { name: "fixture", workspaces: ["packages/*"] });
    write("packages/library/package.json", { name: "@test/core" });
    write("bin/bun", "#!/bin/sh\ncat audit-response.json\nexit 1\n", 0o755);
    const execute = () =>
      spawnSync(
        process.execPath,
        [new URL("./dependency-audit.mjs", import.meta.url).pathname],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${join(root, "bin")}:${process.env.PATH}`,
          },
        },
      );
    const read = () =>
      JSON.parse(
        readFileSync(join(root, "packages/library/reports/audit.json"), "utf8"),
      );
    write("audit-response.json", {
      affected: [{ ...advisory, severity: "moderate" }],
    });
    assert.equal(execute().status, 0);
    assert.equal(read().status, "passed");
    assert.equal(read().runtime.length, 0);
    assert.equal(read().findings.length, 1);
    write("audit-response.json", { affected: [advisory] });
    assert.equal(execute().status, 1);
    assert.equal(read().status, "failed");
    write("audit-response.json", "");
    write(
      "bin/bun",
      "#!/bin/sh\necho 'ConnectionRefused: audit request failed' >&2\nexit 1\n",
      0o755,
    );
    const failed = execute();
    assert.equal(failed.status, 1);
    assert.equal(read().status, "error");
    assert.match(failed.stderr, /ConnectionRefused: audit request failed/);
    assert.match(read().error, /ConnectionRefused: audit request failed/);
    assert.match(
      JSON.parse(
        readFileSync(join(root, "reports/audit-lockfile.json"), "utf8"),
      ).error,
      /ConnectionRefused/,
    );
    write("audit-response.json", '{"invalid":');
    write(
      "bin/bun",
      "#!/bin/sh\ncat audit-response.json\necho 'Registry proxy returned an incomplete response' >&2\nexit 1\n",
      0o755,
    );
    assert.equal(execute().status, 1);
    assert.match(
      read().error,
      /Registry proxy returned an incomplete response/,
    );
    write(
      "bin/bun",
      "#!/bin/sh\necho 'Scanner terminated unexpectedly' >&2\nkill -TERM $$\n",
      0o755,
    );
    assert.equal(execute().status, 1);
    assert.match(read().error, /Scanner terminated unexpectedly/);
  });
});

test("audit initialization failures replace stale reports for every configured workspace", () => {
  fixture(({ root, write }) => {
    const lock = {
      workspaces: {
        "": { name: "fixture" },
        "packages/library": { name: "@test/core" },
        "apps/example": { name: "@test/example" },
      },
      packages: {},
    };
    write("package.json", {
      name: "fixture",
      workspaces: ["packages/*", "apps/*"],
    });
    write("packages/library/package.json", { name: "@test/core" });
    write("apps/example/package.json", { name: "@test/example" });
    write(
      "bin/bun",
      "#!/bin/sh\nprintf '.' >> audit-called.txt\nprintf '{}'\n",
      0o755,
    );
    const execute = () =>
      spawnSync(
        process.execPath,
        [new URL("./dependency-audit.mjs", import.meta.url).pathname],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${join(root, "bin")}:${process.env.PATH}`,
          },
        },
      );
    const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
    for (const failure of [
      "malformed",
      "missing",
      "unreadable",
      "invalid-shape",
      "missing-workspace",
    ]) {
      rmSync(join(root, "bun.lock"), { recursive: true, force: true });
      write("bun.lock", lock);
      const success = execute();
      assert.equal(success.status, 0, success.stderr);
      const calls = readFileSync(join(root, "audit-called.txt"), "utf8");
      const paths = [
        "reports/audit.json",
        "packages/library/reports/audit.json",
        "apps/example/reports/audit.json",
        "reports/audit-lockfile.json",
      ];
      for (const path of paths)
        write(path, { ...read(path), checkedAt: "stale" });
      if (failure === "malformed") write("bun.lock", "{");
      if (failure === "missing") rmSync(join(root, "bun.lock"));
      if (failure === "unreadable") {
        rmSync(join(root, "bun.lock"));
        // A directory gives a portable read failure, even under a privileged test user.
        mkdirSync(join(root, "bun.lock"));
      }
      if (failure === "invalid-shape") write("bun.lock", { workspaces: null });
      if (failure === "missing-workspace")
        write("bun.lock", {
          workspaces: { "": { name: "fixture" } },
          packages: {},
        });
      const result = execute();
      assert.equal(result.status, 1, failure);
      assert.match(result.stderr, /Dependency audit failed:/);
      assert.equal(
        readFileSync(join(root, "audit-called.txt"), "utf8"),
        calls,
        "Initialization failure must not invoke the scanner",
      );
      for (const path of paths) {
        const report = read(path);
        assert.equal(report.status, "error", `${failure}: ${path}`);
        assert.notEqual(report.checkedAt, "stale");
        assert.ok(report.error.length > 0);
      }
      assert.equal(
        existsSync(join(root, "reports/audit-advisories.json")),
        false,
        "Previous raw advisory payload must not survive a failed initialization",
      );
    }
  });
});
