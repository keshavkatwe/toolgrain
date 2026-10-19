import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
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
import { parseAudit } from "../src/audit.mjs";
import { checkSize } from "../src/package-size.mjs";

const repo = new URL("../../../", import.meta.url);
const cli = new URL("../src/cli.mjs", import.meta.url).pathname;

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
  const compiled = files.map((file) => file.path);
  assert.equal(
    checkSize(files, 20, budget, compiled, ["src/index.ts"]).status,
    "passed",
  );
  assert.deepEqual(
    checkSize(
      [...files, { path: "dist/removed.js", bytes: 0 }],
      20,
      budget,
      [...compiled, "dist/removed.js"],
      ["src/index.ts"],
    ).errors,
    [
      "Stale build output without source: dist/removed.js; run bun run build --force",
    ],
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
  write(
    "package-size.config.json",
    readFileSync(new URL("package-size.config.json", repo), "utf8"),
  );
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
    const result = spawnSync(process.execPath, [cli, "size"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(
      readFileSync(join(root, "reports/size.json"), "utf8"),
    );
    assert.ok(report.packedBytes > 0);
    assert.match(report.errors.join(), /Unexpected package file: secret.txt/);
  });
});

test("packed protocol archives must retain internal modules and both revisions' vendor artifacts", () => {
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
      const result = spawnSync(process.execPath, [cli, "size"], {
        cwd: root,
        encoding: "utf8",
        timeout: 60_000,
      });
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
    for (const name of ["cli.mjs", "package-size.mjs"])
      write(
        `tools/${name}`,
        readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8"),
      );
    const library = {
      name: "@toolgrain/mcp",
      version: "0.0.0",
      private: true,
      files: ["dist"],
      scripts: {
        build: "node build.mjs",
        "test:size": "bun ../../tools/cli.mjs size",
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

test("audit command writes the lockfile result and fails on high findings or scanner errors", () => {
  fixture(({ root, write }) => {
    const execute = () =>
      spawnSync(process.execPath, [cli, "audit"], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${join(root, "bin")}:${process.env.PATH}`,
        },
      });
    const read = () =>
      JSON.parse(readFileSync(join(root, "reports/audit.json"), "utf8"));
    write("bin/bun", "#!/bin/sh\ncat audit-response.json\nexit 1\n", 0o755);
    write("audit-response.json", {
      affected: [{ ...advisory, severity: "moderate" }],
    });
    assert.equal(execute().status, 0);
    assert.equal(read().status, "passed");
    assert.equal(read().advisories.affected.length, 1);
    write("audit-response.json", { affected: [advisory] });
    assert.equal(execute().status, 1);
    assert.equal(read().status, "failed");
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
