import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseAudit } from "../src/audit.mjs";
import { checkSize, checkSourceMaps } from "../src/package-size.mjs";

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

test("mapped packages require both map types and sources without widening other package boundaries", () => {
  const compiled = ["dist/index.js", "dist/index.d.ts"];
  const paths = [
    ...compiled,
    ...compiled.map((path) => `${path}.map`),
    "src/index.ts",
  ];
  const files = paths.map((path) => ({ path, bytes: 1 }));
  const budget = { packedBytes: 100, unpackedBytes: 100, sourceMaps: true };
  const sources = ["src/index.ts"];
  assert.equal(checkSize(files, 1, budget, compiled, sources).status, "passed");
  assert.throws(
    () => checkSize(files, 1, { ...budget, sourceMaps: "yes" }),
    /Invalid sourceMaps policy/,
  );
  for (const path of paths.slice(2)) {
    const report = checkSize(
      files.filter((file) => file.path !== path),
      1,
      budget,
      compiled,
      sources,
    );
    assert.ok(report.errors.includes(`Missing required package file: ${path}`));
  }
  for (const path of [
    "src/.env.ts",
    "src/../secret.ts",
    "src/index.js",
    "test/index.ts",
    "src/unknown.ts",
  ]) {
    const report = checkSize(
      [...files, { path, bytes: 1 }],
      1,
      budget,
      compiled,
      sources,
    );
    assert.ok(report.errors.includes(`Unexpected package file: ${path}`));
  }
  const stale = checkSize(
    files,
    1,
    budget,
    [...compiled, "dist/removed.js.map"],
    sources,
  );
  assert.ok(
    stale.errors.includes(
      "Stale build output without source: dist/removed.js.map; run bun run build --force",
    ),
  );
  assert.ok(
    stale.errors.includes("Missing required package file: dist/removed.js"),
  );
});

test("source map validation rejects malformed maps, wrong targets and missing sources or references", () => {
  for (const extension of ["js", "d.ts"]) {
    const compiled = `dist/tools/example.${extension}`;
    const path = `${compiled}.map`;
    const source = "src/tools/example.ts";
    const map = {
      version: 3,
      file: `example.${extension}`,
      sourceRoot: "",
      sources: ["../../src/tools/example.ts"],
      names: [],
      mappings: "AAAA",
    };
    const contents = new Map([
      [compiled, `export {};\n//# sourceMappingURL=example.${extension}.map\n`],
      [path, JSON.stringify(map)],
      [source, "export {};\n"],
    ]);
    assert.deepEqual(checkSourceMaps(contents), []);
    for (const invalid of [
      null,
      { ...map, version: 2 },
      { ...map, file: "wrong.js" },
      { ...map, sourceRoot: "https://example.com/" },
      { ...map, sources: [] },
      { ...map, mappings: [] },
    ]) {
      const broken = new Map(contents).set(path, JSON.stringify(invalid));
      assert.deepEqual(checkSourceMaps(broken), [
        `Invalid source map: ${path}`,
      ]);
    }
    assert.deepEqual(checkSourceMaps(new Map(contents).set(path, "{")), [
      `Invalid source map JSON: ${path}`,
    ]);
    const wrong = new Map(contents).set(
      path,
      JSON.stringify({ ...map, sources: ["../../src/other.ts"] }),
    );
    assert.deepEqual(checkSourceMaps(wrong), [
      `Unexpected source map target: ${path} -> src/other.ts`,
    ]);
    const missingSource = new Map(contents);
    missingSource.delete(source);
    assert.deepEqual(checkSourceMaps(missingSource), [
      `Missing source map target: ${path} -> ${source}`,
    ]);
    const missingCompiled = new Map(contents);
    missingCompiled.delete(compiled);
    assert.deepEqual(checkSourceMaps(missingCompiled), [
      `Source map has no compiled file: ${path}`,
    ]);
    assert.deepEqual(
      checkSourceMaps(new Map(contents).set(compiled, "export {};\n")),
      [`Missing source map reference: ${compiled}`],
    );
  }
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
    for (const name of ["README.md", "LICENSE", "NOTICE"])
      write(name, "fixture\n");
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
      write("package.json", { ...manifest, files: [...included, "NOTICE"] });
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

test("packed MCP archives retain maps and sources and reject dangling or invalid map targets", () => {
  fixture(({ root, write }) => {
    for (const name of ["README.md", "LICENSE"]) write(name, "fixture\n");
    const paths = [];
    for (const stem of ["index", "tools/example"]) {
      const source = `src/${stem}.ts`;
      paths.push(source);
      write(source, "export {};\n");
      for (const extension of ["js", "d.ts"]) {
        const compiled = `dist/${stem}.${extension}`;
        const file = `${stem.split("/").at(-1)}.${extension}`;
        const map = {
          version: 3,
          file,
          sourceRoot: "",
          sources: [`${stem.includes("/") ? "../../" : "../"}${source}`],
          names: [],
          mappings: "AAAA",
        };
        paths.push(compiled, `${compiled}.map`);
        write(compiled, `export {};\n//# sourceMappingURL=${file}.map\n`);
        write(`${compiled}.map`, map);
      }
    }
    const execute = (files) => {
      write("package.json", {
        name: "@toolgrain/mcp",
        version: "0.0.0",
        private: true,
        files,
      });
      const result = spawnSync(process.execPath, [cli, "size"], {
        cwd: root,
        encoding: "utf8",
        timeout: 60_000,
      });
      const report = JSON.parse(
        readFileSync(join(root, "reports/size.json"), "utf8"),
      );
      assert.equal(
        result.status,
        report.status === "passed" ? 0 : 1,
        result.stderr,
      );
      return report;
    };
    assert.equal(execute(["dist", "src/**/*.ts"]).status, "passed");
    for (const path of paths.filter(
      (path) => path.endsWith(".map") || path.startsWith("src/"),
    )) {
      const report = execute(paths.filter((included) => included !== path));
      assert.ok(
        report.errors.includes(`Missing required package file: ${path}`),
      );
      if (path.startsWith("src/"))
        assert.ok(
          report.errors.some((error) =>
            error.startsWith("Missing source map target:"),
          ),
        );
    }
    write("dist/index.js.map", "{");
    assert.ok(
      execute(["dist", "src/**/*.ts"]).errors.includes(
        "Invalid source map JSON: dist/index.js.map",
      ),
    );
  });
});

test("MCP compatibility checks isolate Zod versions and fail on consumer or runtime regressions", {
  timeout: 30_000,
}, () => {
  fixture(({ root, write }) => {
    const directory = join(root, "packages/mcp");
    const temporary = join(root, "temporary");
    mkdirSync(temporary);
    write(
      "tsconfig.base.json",
      readFileSync(new URL("tsconfig.base.json", repo), "utf8"),
    );
    write("packages/mcp/package.json", {
      name: "@toolgrain/mcp",
      type: "module",
      exports: {
        ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      },
      peerDependencies: { zod: "^4.6.6" },
    });
    write(
      "packages/mcp/dist/index.js",
      'import {createRequire} from "node:module";import {z} from "zod";export const schema=z.string();export const version=createRequire(import.meta.url)("zod/package.json").version;',
    );
    write(
      "packages/mcp/dist/index.d.ts",
      'export declare const schema: import("zod").ZodString;export declare const version: string;',
    );
    write("packages/mcp/src/index.ts", "export {};\n");
    const protocol = "packages/mcp/node_modules/@toolgrain/protocol";
    write(`${protocol}/package.json`, {
      name: "@toolgrain/protocol",
      type: "module",
    });
    write(`${protocol}/dist/index.js`, "export {};\n");
    for (const name of ["typescript", "zod"])
      symlinkSync(
        new URL(`packages/mcp/node_modules/${name}`, repo).pathname,
        join(directory, "node_modules", name),
        "dir",
      );
    write(
      "packages/mcp/smoke/tsconfig.json",
      readFileSync(new URL("packages/mcp/smoke/tsconfig.json", repo), "utf8"),
    );
    const consumer = [
      'import {schema} from "@toolgrain/mcp";',
      'const value: string = schema.parse("ok");',
      "// @ts-expect-error Consumer errors must still be rejected.",
      "const invalid: number = value;",
    ].join("\n");
    const runtime = [
      'import assert from "node:assert/strict";',
      'import {readFileSync} from "node:fs";',
      'import {schema,version} from "@toolgrain/mcp";',
      "assert.equal(process.versions.bun, undefined);",
      'assert.equal(schema.parse("ok"), "ok");',
      'assert.equal(readFileSync(new URL("../src/index.ts", import.meta.resolve("@toolgrain/mcp")), "utf8"), "export {};\\n");',
      'console.log("Resolved Zod " + version);',
    ].join("\n");
    write("packages/mcp/smoke/consumer.mts", consumer);
    write("packages/mcp/smoke/runtime.mjs", runtime);
    const execute = () =>
      spawnSync(process.execPath, [cli, "mcp-compat"], {
        cwd: directory,
        encoding: "utf8",
        timeout: 20_000,
        env: { ...process.env, TMPDIR: temporary },
      });
    const passed = execute();
    assert.equal(passed.status, 0, `${passed.stdout}\n${passed.stderr}`);
    const currentZod = JSON.parse(
      readFileSync(new URL("packages/mcp/node_modules/zod/package.json", repo)),
    ).version;
    for (const version of ["4.6.6", currentZod]) {
      assert.ok(passed.stdout.includes(`Resolved Zod ${version}`));
      assert.ok(passed.stdout.includes(`TypeScript 5.5.4 / Zod ${version}`));
    }
    write(
      "packages/mcp/smoke/consumer.mts",
      `${consumer}\nconst regression: boolean = schema.parse("ok");`,
    );
    const types = execute();
    assert.equal(types.status, 1);
    assert.match(types.stdout, /not assignable to type 'boolean'/);
    write("packages/mcp/smoke/consumer.mts", consumer);
    write(
      "packages/mcp/smoke/runtime.mjs",
      `${runtime}\nthrow new Error("fixture runtime failure");`,
    );
    const execution = execute();
    assert.equal(execution.status, 1);
    assert.match(execution.stderr, /fixture runtime failure/);
    assert.deepEqual(readdirSync(temporary), []);
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
      name: "@toolgrain/http",
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
      dependencies: { "@toolgrain/http": "workspace:*" },
      scripts: { build: "node -e 'process.exit(1)'" },
    };
    write("packages/library/package.json", library);
    for (const name of ["README.md", "LICENSE"])
      write(`packages/library/${name}`, "fixture\n");
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
        "@toolgrain/http": entry(
          "@toolgrain/http",
          "workspace:packages/library",
        ),
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
