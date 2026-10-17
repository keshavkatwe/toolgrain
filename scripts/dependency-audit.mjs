import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { JSONC, semver } from "bun";
import { auditFindings, dependencyGraph, parseAudit } from "./audit-graph.mjs";

// A root command rather than a cached Turbo task: advisories change independently of Git.
const lock = JSONC.parse(readFileSync("bun.lock", "utf8"));
const workspaces = Object.keys(lock.workspaces);
const write = (workspace, report) => {
  const directory = `${workspace ? `${workspace}/` : ""}reports`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    `${directory}/audit.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
};
const checkedAt = new Date().toISOString();
try {
  const audit = spawnSync("bun", ["audit", "--json"], {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  // A nonzero exit with a valid nonempty advisory response means vulnerabilities.
  // Connection failures, malformed responses and process failures must never look clean.
  const scannerError = (message) => {
    const diagnostic = audit.stderr?.trim();
    return new Error(
      `${message}${diagnostic ? `\nScanner stderr: ${diagnostic}` : ""}`,
    );
  };
  if (audit.error || ![0, 1].includes(audit.status))
    throw scannerError(
      audit.error?.message ??
        `Audit process exited with status ${audit.status}`,
    );
  let advisories;
  try {
    advisories = parseAudit(audit.stdout, audit.status);
  } catch (error) {
    throw scannerError(error.message);
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/audit-advisories.json",
    `${JSON.stringify(advisories, null, 2)}\n`,
  );
  const lockfileFailed = Object.values(advisories)
    .flat()
    .some((item) => ["high", "critical"].includes(item.severity));
  writeFileSync(
    "reports/audit-lockfile.json",
    `${JSON.stringify({ checkedAt, threshold: "high", status: lockfileFailed ? "failed" : "passed", advisories }, null, 2)}\n`,
  );
  let blocking = lockfileFailed;
  for (const workspace of workspaces) {
    const manifest = JSON.parse(
      readFileSync(`${workspace ? `${workspace}/` : ""}package.json`, "utf8"),
    );
    const runtime = auditFindings(
      dependencyGraph(lock, workspace),
      advisories,
      semver.satisfies,
    );
    const findings = auditFindings(
      dependencyGraph(lock, workspace, true),
      advisories,
      semver.satisfies,
    );
    const report = {
      name: manifest.name,
      checkedAt,
      status: findings.some((item) =>
        ["high", "critical"].includes(item.severity),
      )
        ? "failed"
        : "passed",
      threshold: "high",
      runtime,
      findings,
    };
    write(workspace, report);
    blocking ||= report.status === "failed";
    console.log(
      `${workspace || "root"}: ${runtime.length} runtime, ${findings.length} total advisories (${report.status})`,
    );
  }
  if (blocking) process.exitCode = 1;
} catch (error) {
  for (const workspace of workspaces)
    write(workspace, { status: "error", checkedAt, error: error.message });
  writeFileSync(
    "reports/audit-lockfile.json",
    `${JSON.stringify({ status: "error", checkedAt, error: error.message }, null, 2)}\n`,
  );
  console.error(`Dependency audit failed: ${error.message}`);
  process.exitCode = 1;
}
