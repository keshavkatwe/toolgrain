import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

const script = new URL("./ci-report.mjs", import.meta.url);

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
  for (const name of ["core", "mcp", "node"]) {
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

function report(root) {
  execFileSync(process.execPath, [script.pathname], {
    cwd: root,
    env: {
      ...process.env,
      CI_STEPS: JSON.stringify({ tests: { outcome: "failure" } }),
      GITHUB_STEP_SUMMARY: join(root, "summary.md"),
    },
  });
  const markdown = readFileSync(join(root, "reports/pr-report.md"), "utf8");
  assert.equal(markdown, readFileSync(join(root, "summary.md"), "utf8"));
  return markdown;
}

test("publishes failing assertions, check status, and the specific coverage shortfall", () => {
  fixture(({ root, write }) => {
    write("packages/mcp/reports/tests.json", {
      numPassedTests: 3,
      numFailedTests: 1,
      numPendingTests: 0,
      numTotalTests: 4,
      testResults: [
        {
          assertionResults: [
            {
              status: "failed",
              fullName: "rejects invalid input",
              failureMessages: ["expected error | got <success>"],
            },
          ],
        },
      ],
    });
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
    assert.match(markdown, /\| packages\/mcp \| 3 \| 1 \| 0 \| 4 \|/);
    assert.match(
      markdown,
      /99% \| 94% \| 100% \| 100% \| 95% \| Below threshold/,
    );
    assert.match(markdown, /rejects invalid input/);
    assert.match(markdown, /expected error &#124; got &lt;success&gt;/);
  });
});

test("marks missing reports unavailable rather than implying a pass", () => {
  fixture(({ root }) => {
    const markdown = report(root);
    assert.match(markdown, /Report unavailable; check build\/install logs/);
    assert.match(
      markdown,
      /\| packages\/core \| — \| — \| — \| — \| 95 \/ 95 \/ 95 \/ 95% \| Unavailable/,
    );
    assert.doesNotMatch(markdown, /\| Pass \|/);
  });
});

test("includes suite startup errors even when no assertions ran", () => {
  fixture(({ root, write }) => {
    write("packages/node/reports/tests.json", {
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
      numTotalTests: 0,
      testResults: [
        {
          status: "failed",
          assertionResults: [],
          message: "Cannot import server",
        },
      ],
    });
    assert.match(report(root), /suite failed.*Cannot import server/);
  });
});
