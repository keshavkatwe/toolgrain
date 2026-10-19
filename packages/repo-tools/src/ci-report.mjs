// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Standalone Actions reporting script; it does not run in a cached Turbo task.
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { readReport } from "./ci-report-data.mjs";

const libraries = [
  "packages/protocol",
  "packages/mcp",
  "packages/node",
  "packages/http",
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

/**
 * Render coverage, size and audit reports for the Actions summary and PR comment.
 * Test results and failure annotations come from Vitest's GitHub Actions reporter.
 * This runs under Node with no installed dependencies, so it works after a failed install.
 */
export function main() {
  const reportErrors = [];
  const read = (path, kind) => readReport(path, kind, reportErrors);
  const lines = [
    "<!-- toolgrain-ci-report -->",
    "## Package CI report",
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
    "Test results and failure annotations are in each workspace's Vitest section of the Actions job summary.",
    "",
    "### Coverage",
    "",
    "Each metric must meet its workspace floor. Missing reports are not a pass.",
    "",
    "| Workspace | Statements | Branches | Functions | Lines | Floor | Result |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
  );
  const failures = [];
  for (const workspace of ["packages/mcp", "packages/node", "packages/http"]) {
    const total = read(
      `${workspace}/coverage/coverage-summary.json`,
      "coverage",
    )?.total;
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
  lines.push(
    "",
    "### Library package sizes",
    "",
    "Sizes cover each package's own tarball, including declarations and required vendor artifacts; dependencies are excluded.",
    "",
    "| Workspace | Packed / budget (bytes) | Unpacked / budget (bytes) | Files | Result |",
    "| --- | ---: | ---: | ---: | --- |",
  );
  for (const workspace of libraries) {
    const report = read(`${workspace}/reports/size.json`, "size");
    if (!report || report.status === "error") {
      lines.push(
        `| ${workspace} | — | — | — | ${escapeMarkdown(report?.errors?.join("; ") ?? "Unavailable")} |`,
      );
      continue;
    }
    lines.push(
      `| ${workspace} | ${report.packedBytes} / ${report.budget.packedBytes} | ${report.unpackedBytes} / ${report.budget.unpackedBytes} | ${report.fileCount} | ${escapeMarkdown(report.status)} |`,
    );
    for (const error of report.errors ?? [])
      failures.push(
        `- **${workspace}: package size/content** ${escapeMarkdown(error)}`,
      );
  }
  const audit = read("reports/audit.json", "audit");
  lines.push(
    "",
    "### Dependency audit",
    "",
    "Covers every package in the Bun lockfile, including development tooling. High/critical advisories fail CI; low/moderate advisories are reported. Audit service or parsing errors fail CI.",
    "",
  );
  if (!audit || audit.status === "error") {
    lines.push(
      `Lockfile audit: **unavailable**. ${escapeMarkdown(audit?.error ?? "Report unavailable")}`,
    );
  } else {
    const advisories = Object.entries(audit.advisories).flatMap(
      ([name, items]) => items.map((item) => ({ name, ...item })),
    );
    const counts = ["low", "moderate", "high", "critical"].map(
      (severity) =>
        advisories.filter((item) => item.severity === severity).length,
    );
    lines.push(
      "| Low | Moderate | High | Critical | Result |",
      "| ---: | ---: | ---: | ---: | --- |",
      `| ${counts.join(" | ")} | ${escapeMarkdown(audit.status)} |`,
    );
    if (advisories.length) lines.push("", "#### Advisory details", "");
    for (const item of advisories) {
      const reference =
        /^https:\/\/github\.com\/advisories\/GHSA-[a-zA-Z0-9-]+$/.test(item.url)
          ? `[advisory](${item.url})`
          : `ID ${escapeMarkdown(item.id)}`;
      lines.push(
        `- **${escapeMarkdown(item.name)} (${escapeMarkdown(item.severity)})**: ${escapeMarkdown(item.title)}. Affected: ${escapeMarkdown(item.vulnerable_versions)}. ${reference}`,
      );
    }
  }
  if (failures.length) lines.push("", "### Failures", "", ...failures);
  if (reportErrors.length) {
    lines.push(
      "",
      "### Report errors",
      "",
      ...reportErrors.map((error) => `- ${escapeMarkdown(error)}`),
    );
    process.exitCode = 1;
  }
  lines.push(
    "",
    "Protocol uses schema integrity checks; examples use real-process integration tests. Neither has a coverage floor.",
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
}
