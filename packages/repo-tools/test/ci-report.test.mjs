import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const cli = new URL("../src/cli.mjs", import.meta.url);

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "toolgrain-ci-report-"));
  const write = (path, data) => {
    const target = join(root, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(
      target,
      typeof data === "string" ? data : JSON.stringify(data),
    );
  };
  for (const name of ["mcp", "node", "http", "jwt", "clerk"]) {
    write(
      `packages/${name}/vitest.config.ts`,
      "statements: 95, branches: 95, functions: 95, lines: 95",
    );
  }
  try {
    run({ root, write });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function report(root, expectedExit = 0) {
  // CI runs the renderer with Node even though the script tests run with Bun.
  const result = spawnSync("node", [cli.pathname, "ci-report"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CI_STEPS: JSON.stringify({ tests: { outcome: "failure" } }),
      GITHUB_STEP_SUMMARY: join(root, "summary.md"),
    },
  });
  assert.equal(result.status, expectedExit, result.stderr);
  const markdown = readFileSync(join(root, "reports/pr-report.md"), "utf8");
  assert.equal(markdown, readFileSync(join(root, "summary.md"), "utf8"));
  return markdown;
}

test("publishes check status and the specific coverage shortfall", () => {
  fixture(({ root, write }) => {
    write("packages/mcp/coverage/coverage-summary.json", {
      total: {
        statements: { pct: 99 },
        branches: { pct: 94 },
        functions: { pct: 100 },
        lines: { pct: 100 },
      },
    });
    const markdown = report(root);
    assert.match(markdown, /\| tests \| failure \|/);
    assert.match(markdown, /Vitest section of the Actions job summary/);
    assert.match(
      markdown,
      /99% \| 94% \| 100% \| 100% \| 95% \| Below threshold/,
    );
  });
});

test("marks missing reports unavailable rather than implying a pass", () => {
  fixture(({ root }) => {
    const markdown = report(root);
    assert.match(markdown, /Lockfile audit: \*\*unavailable\*\*/);
    assert.match(
      markdown,
      /\| packages\/node \| — \| — \| — \| — \| 95 \/ 95 \/ 95 \/ 95% \| Unavailable/,
    );
    assert.doesNotMatch(markdown, /\| Pass \|/);
  });
});

test("reports size budgets, advisories and scan errors without hiding failures", () => {
  const finding = {
    id: 1,
    severity: "high",
    title: "Unsafe <input>",
    vulnerable_versions: "<2.0.0",
    url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
  };
  fixture(({ root, write }) => {
    write("packages/node/reports/size.json", {
      packedBytes: 110,
      unpackedBytes: 200,
      fileCount: 9,
      budget: { packedBytes: 100, unpackedBytes: 250 },
      status: "failed",
      errors: ["Packed size exceeds budget"],
    });
    write("reports/audit.json", {
      status: "failed",
      advisories: {
        dependency: [finding, { ...finding, id: 2, severity: "low" }],
      },
    });
    const markdown = report(root);
    assert.match(markdown, /110 \/ 100 \| 200 \/ 250 \| 9 \| failed/);
    assert.match(markdown, /Packed size exceeds budget/);
    assert.match(markdown, /\| 1 \| 0 \| 1 \| 0 \| failed \|/);
    assert.match(markdown, /dependency \(high\)\*\*: Unsafe &lt;input&gt;/);
    assert.match(markdown, /\[advisory\]\(https:\/\/github\.com\/advisories/);
  });
  fixture(({ root, write }) => {
    write("reports/audit.json", {
      status: "error",
      error: "Advisory service unavailable",
    });
    assert.match(
      report(root),
      /Lockfile audit: \*\*unavailable\*\*\. Advisory service unavailable/,
    );
  });
});

test("malformed report files produce diagnostics without losing healthy results or the Actions summary", () => {
  const corruptions = [
    ["packages/node/reports/size.json", '{"status":'],
    ["packages/node/reports/size.json", {}],
    [
      "packages/node/coverage/coverage-summary.json",
      { total: { statements: { pct: "bad" } } },
    ],
    ["reports/audit.json", { status: "passed", advisories: null }],
    ["reports/audit.json", { status: "passed", advisories: { x: [{}] } }],
  ];
  for (const [path, data] of corruptions) {
    fixture(({ root, write }) => {
      write("packages/http/reports/size.json", {
        status: "passed",
        packedBytes: 10,
        unpackedBytes: 20,
        fileCount: 3,
        budget: { packedBytes: 30, unpackedBytes: 40 },
        errors: [],
      });
      write("reports/audit.json", { status: "passed", advisories: {} });
      write(path, data);
      const markdown = report(root, 1);
      assert.ok(markdown.includes(path), path);
      assert.match(markdown, /### Report errors/);
      assert.match(
        markdown,
        /packages\/http \| 10 \/ 30 \| 20 \/ 40 \| 3 \| passed/,
      );
      if (path !== "reports/audit.json")
        assert.match(markdown, /\| 0 \| 0 \| 0 \| 0 \| passed \|/);
    });
  }
});
