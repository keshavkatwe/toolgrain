// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Standalone Actions reporting script; it does not run in a cached Turbo task.
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

const workspaces = [
  "packages/core",
  "packages/protocol",
  "packages/mcp",
  "packages/node",
  "apps/stdio-example",
];
const escapeMarkdown = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replaceAll("`", "&#96;")
    .replaceAll("\r", "")
    .replaceAll("\n", "<br>");
const read = (path) =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
const lines = [
  "<!-- toolgrain-ci-report -->",
  "## Test and coverage report",
  "",
  `Commit: ${escapeMarkdown(process.env.GITHUB_SHA ?? "local")}`,
  "",
  "### CI checks",
  "",
  "| Check | Status |",
  "| --- | --- |",
];
const steps = process.env.CI_STEPS ? JSON.parse(process.env.CI_STEPS) : {};
for (const [name, step] of Object.entries(steps)) {
  lines.push(`| ${escapeMarkdown(name)} | ${escapeMarkdown(step.outcome)} |`);
}
lines.push(
  "",
  "### Tests",
  "",
  "| Workspace | Passed | Failed | Pending | Total |",
  "| --- | ---: | ---: | ---: | ---: |",
);
const failures = [];
for (const workspace of workspaces) {
  const report = read(`${workspace}/reports/tests.json`);
  if (!report) {
    lines.push(
      `| ${workspace} | — | — | — | Report unavailable; check build/install logs |`,
    );
    continue;
  }
  lines.push(
    `| ${workspace} | ${report.numPassedTests} | ${report.numFailedTests} | ${report.numPendingTests} | ${report.numTotalTests} |`,
  );
  for (const suite of report.testResults ?? []) {
    for (const test of suite.assertionResults ?? []) {
      if (test.status === "failed")
        failures.push(
          `- **${escapeMarkdown(workspace)}: ${escapeMarkdown(test.fullName)}**<br>${escapeMarkdown((test.failureMessages ?? []).join("\n")).slice(0, 2500)}`,
        );
    }
    if (
      suite.status === "failed" &&
      !(suite.assertionResults ?? []).some((test) => test.status === "failed")
    ) {
      failures.push(
        `- **${escapeMarkdown(workspace)}: suite failed**<br>${escapeMarkdown(suite.message).slice(0, 2500)}`,
      );
    }
  }
}
lines.push(
  "",
  "### Coverage",
  "",
  "Each metric must meet its workspace floor. Missing reports are not a pass.",
  "",
  "| Workspace | Statements | Branches | Functions | Lines | Floor | Result |",
  "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
);
for (const workspace of ["packages/core", "packages/mcp", "packages/node"]) {
  const total = read(`${workspace}/coverage/coverage-summary.json`)?.total;
  // Read the same thresholds Vitest enforces, rather than maintaining a second policy.
  const config = readFileSync(`${workspace}/vitest.config.ts`, "utf8");
  const metrics = ["statements", "branches", "functions", "lines"];
  const floors = metrics.map((metric) =>
    Number(config.match(new RegExp(`${metric}:\\s*(\\d+)`))?.[1]),
  );
  if (floors.some((floor) => !Number.isFinite(floor)))
    throw new Error(`Missing coverage thresholds: ${workspace}`);
  if (!total) {
    lines.push(
      `| ${workspace} | — | — | — | — | ${floors.join(" / ")}% | Unavailable |`,
    );
    continue;
  }
  const percentages = metrics.map((metric) => total[metric].pct);
  const passed = percentages.every(
    (pct, index) => typeof pct === "number" && pct >= floors[index],
  );
  lines.push(
    `| ${workspace} | ${percentages.map((pct) => `${pct}%`).join(" | ")} | ${floors.every((floor) => floor === floors[0]) ? floors[0] : floors.join(" / ")}% | ${passed ? "Pass" : "Below threshold"} |`,
  );
}
if (failures.length) lines.push("", "### Failed tests", "", ...failures);
lines.push(
  "",
  "Protocol uses schema integrity checks; the example uses subprocess tests. Neither has a coverage floor.",
  "",
  "A failed check prevents this CI job from passing. Coverage does not establish assertion quality.",
);
if (process.env.GITHUB_RUN_ID)
  lines.push(
    "",
    `[Open logs and download full reports](https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID})`,
  );
// GitHub comments have a size limit; full details remain in the uploaded reports.
let markdown = lines.join("\n");
if (markdown.length > 55000)
  markdown = `${markdown.slice(0, 54000)}\n\nReport truncated. Open the Actions run for complete reports.\n`;
mkdirSync("reports", { recursive: true });
writeFileSync("reports/pr-report.md", markdown);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
