import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

export const severities = ["info", "low", "moderate", "high", "critical"];
const blocking = ["high", "critical"];

export function validateAdvisories(value) {
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new Error("Invalid advisory response");
  for (const [name, advisories] of Object.entries(value)) {
    if (!Array.isArray(advisories) || advisories.length === 0)
      throw new Error(`Invalid advisories: ${name}`);
    for (const item of advisories) {
      if (
        !severities.includes(item.severity) ||
        typeof item.vulnerable_versions !== "string" ||
        !item.vulnerable_versions ||
        typeof item.title !== "string" ||
        typeof item.url !== "string" ||
        !Number.isSafeInteger(item.id)
      )
        throw new Error(`Invalid advisory: ${name}`);
    }
  }
  return value;
}

export function parseAudit(stdout, status) {
  if (![0, 1].includes(status))
    throw new Error(`Audit process failed (exit ${status})`);
  const advisories = validateAdvisories(JSON.parse(stdout));
  if (status === 1 && Object.keys(advisories).length === 0)
    throw new Error("Audit failed without advisories");
  return advisories;
}

const write = (report) => {
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/audit.json", `${JSON.stringify(report, null, 2)}\n`);
};

/**
 * Audit the complete lockfile. A root command rather than a cached Turbo task:
 * advisories change independently of Git.
 */
export function main() {
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
    const found = Object.values(advisories).flat();
    const status = found.some((item) => blocking.includes(item.severity))
      ? "failed"
      : "passed";
    write({ checkedAt, threshold: "high", status, advisories });
    console.log(`Dependency audit: ${found.length} advisories (${status})`);
    if (status === "failed") process.exitCode = 1;
  } catch (error) {
    write({ status: "error", checkedAt, error: error.message });
    console.error(`Dependency audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}
