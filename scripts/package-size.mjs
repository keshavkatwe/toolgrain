import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Archive } from "bun";

function exportTargets(value) {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") {
    if (
      !value.startsWith("./") ||
      value.includes("*") ||
      value
        .split("/")
        .slice(1)
        .some((part) => !part || part === "." || part === "..")
    )
      throw new Error(`Unsupported package export target: ${value}`);
    return [value.slice(2)];
  }
  if (typeof value !== "object") throw new Error("Invalid package exports");
  return Object.values(value).flatMap(exportTargets);
}

export function checkSize(
  files,
  packedBytes,
  budget,
  manifest = {},
  compiledFiles = [],
) {
  for (const key of ["packedBytes", "unpackedBytes"]) {
    if (!Number.isSafeInteger(budget?.[key]) || budget[key] <= 0)
      throw new Error(`Invalid size budget: ${key}`);
  }
  const unpackedBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const errors = [];
  if (packedBytes > budget.packedBytes)
    errors.push("Packed size exceeds budget");
  if (unpackedBytes > budget.unpackedBytes)
    errors.push("Unpacked size exceeds budget");
  if (
    budget.requiredFiles !== undefined &&
    (!Array.isArray(budget.requiredFiles) ||
      budget.requiredFiles.some((path) => typeof path !== "string" || !path))
  )
    throw new Error("Invalid required package files");
  const requiredFiles = [
    ...new Set([
      "dist/index.js",
      "dist/index.d.ts",
      ...exportTargets(manifest.exports),
      ...compiledFiles,
      ...(budget.requiredFiles ?? []),
    ]),
  ].sort();
  const inventory = new Set(files.map((file) => file.path));
  for (const path of requiredFiles) {
    if (!inventory.has(path))
      errors.push(`Missing required package file: ${path}`);
  }
  for (const file of files) {
    if (
      file.path !== "package.json" &&
      !/^(?:README|LICENSE|LICENCE|NOTICE)(?:\.[^/]*)?$/i.test(file.path) &&
      !/^dist\/(?:[^./\\][^/\\]*\/)*[^./\\][^/\\]*\.(?:js|d\.ts)(?:\.map)?$/.test(
        file.path,
      ) &&
      !/^dist\/vendor\/(?:2026-07-28|2025-06-18)\/(?:schema\.ts|LICENSE|provenance\.json)$/.test(
        file.path,
      )
    )
      errors.push(`Unexpected package file: ${file.path}`);
  }
  return {
    packedBytes,
    unpackedBytes,
    fileCount: files.length,
    budget,
    files,
    requiredFiles,
    errors,
    status: errors.length ? "failed" : "passed",
  };
}

if (import.meta.main) {
  mkdirSync("reports", { recursive: true });
  const destination = mkdtempSync(join(tmpdir(), "toolgrain-size-"));
  let report;
  try {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    const budgets = JSON.parse(
      readFileSync(
        new URL("../package-size.config.json", import.meta.url),
        "utf8",
      ),
    );
    const archivePath = join(destination, "package.tgz");
    const packed = spawnSync(
      "bun",
      ["pm", "pack", "--ignore-scripts", "--filename", archivePath],
      { encoding: "utf8", timeout: 60_000 },
    );
    if (packed.error || packed.status !== 0)
      throw new Error(
        packed.error?.message ?? packed.stderr ?? "Packing failed",
      );
    const bytes = readFileSync(archivePath);
    const entries = await new Archive(bytes).files();
    const files = [...entries]
      .map(([path, file]) => ({
        path: path.replace(/^package\//, ""),
        bytes: file.size,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
    // Check the actual archive against the build, including internal modules and
    // declarations that are referenced by an exported entry point.
    const compiledFiles = readdirSync("dist", { recursive: true })
      .map((path) => `dist/${path.replaceAll("\\", "/")}`)
      .filter((path) => /\.(?:js|d\.ts)$/.test(path));
    report = {
      name: manifest.name,
      ...checkSize(
        files,
        bytes.byteLength,
        budgets[manifest.name],
        manifest,
        compiledFiles,
      ),
    };
  } catch (error) {
    report = { status: "error", errors: [error.message] };
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
  writeFileSync("reports/size.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `${report.name ?? "Package"}: ${report.status}; packed ${report.packedBytes ?? "—"} B, unpacked ${report.unpackedBytes ?? "—"} B, ${report.fileCount ?? "—"} files`,
  );
  for (const error of report.errors) console.error(error);
  if (report.status !== "passed") process.exitCode = 1;
}
