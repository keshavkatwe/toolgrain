import { existsSync, readFileSync } from "node:fs";
import { validateAdvisories } from "./audit.mjs";

const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const strings = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const count = (value) => Number.isSafeInteger(value) && value >= 0;
function valid(report, kind) {
  if (!object(report)) return false;
  if (["size", "audit"].includes(kind)) {
    if (report.status === "error")
      return kind === "size"
        ? strings(report.errors) && report.errors.length > 0
        : typeof report.error === "string";
    if (!["passed", "failed"].includes(report.status)) return false;
  }
  switch (kind) {
    case "coverage":
      return (
        object(report.total) &&
        ["statements", "branches", "functions", "lines"].every((key) => {
          const pct = report.total[key]?.pct;
          return (
            typeof pct === "number" &&
            Number.isFinite(pct) &&
            pct >= 0 &&
            pct <= 100
          );
        })
      );
    case "size":
      return (
        ["packedBytes", "unpackedBytes", "fileCount"].every((key) =>
          count(report[key]),
        ) &&
        object(report.budget) &&
        ["packedBytes", "unpackedBytes"].every(
          (key) => count(report.budget[key]) && report.budget[key] > 0,
        ) &&
        strings(report.errors)
      );
    case "audit":
      validateAdvisories(report.advisories);
      return true;
    default:
      throw new Error(`Unknown report kind: ${kind}`);
  }
}

export function readReport(path, kind, errors) {
  if (!existsSync(path)) return undefined;
  try {
    const report = JSON.parse(readFileSync(path, "utf8"));
    if (!valid(report, kind)) throw new Error(`Invalid ${kind} report schema`);
    return report;
  } catch (error) {
    const message = `${path}: ${error.message}`;
    errors.push(message);
    return { status: "error", error: message, errors: [message] };
  }
}
