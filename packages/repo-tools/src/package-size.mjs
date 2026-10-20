import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { Archive } from "bun";

export function checkSize(
  files,
  packedBytes,
  budget,
  compiledFiles = [],
  sourceFiles = undefined,
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
  if (budget.sourceMaps !== undefined && typeof budget.sourceMaps !== "boolean")
    throw new Error("Invalid sourceMaps policy");
  const sources = new Set(sourceFiles ?? []);
  const modules = [
    "dist/index.js",
    "dist/index.d.ts",
    ...compiledFiles.map((path) => path.replace(/\.map$/, "")),
  ];
  const requiredFiles = [
    ...new Set([
      ...modules,
      ...compiledFiles,
      ...(budget.sourceMaps
        ? [
            ...modules.map((path) => `${path}.map`),
            ...(sourceFiles ?? []).filter((path) => path.endsWith(".ts")),
          ]
        : []),
      ...(budget.requiredFiles ?? []),
    ]),
  ].sort();
  // Turbo restores cached outputs without removing extra files, so a compiled
  // module can outlive its source. Libraries compile src/**/*.ts into dist.
  if (sourceFiles) {
    for (const path of compiledFiles) {
      const source = path
        .replace(/^dist\//, "src/")
        .replace(/\.(?:d\.ts|js)(?:\.map)?$/, ".ts");
      if (!sources.has(source))
        errors.push(
          `Stale build output without source: ${path}; run bun run build --force`,
        );
    }
  }
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
      ) &&
      !(
        budget.sourceMaps &&
        /^src\/(?:[^./\\][^/\\]*\/)*[^./\\][^/\\]*\.ts$/.test(file.path) &&
        sources.has(file.path)
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

/** This tsc build emits one relative TypeScript source per JavaScript/declaration map. */
export function checkSourceMaps(contents) {
  const errors = [];
  for (const [path, text] of contents) {
    if (!/^dist\/.*\.(?:js|d\.ts)\.map$/.test(path)) continue;
    const compiled = path.slice(0, -4);
    if (!contents.has(compiled)) {
      errors.push(`Source map has no compiled file: ${path}`);
      continue;
    }
    let map;
    try {
      map = JSON.parse(text);
    } catch {
      errors.push(`Invalid source map JSON: ${path}`);
      continue;
    }
    if (
      map?.version !== 3 ||
      map.file !== posix.basename(compiled) ||
      (map.sourceRoot !== undefined && map.sourceRoot !== "") ||
      !Array.isArray(map.sources) ||
      map.sources.length !== 1 ||
      typeof map.sources[0] !== "string" ||
      posix.isAbsolute(map.sources[0]) ||
      !Array.isArray(map.names) ||
      !map.names.every((name) => typeof name === "string") ||
      typeof map.mappings !== "string"
    ) {
      errors.push(`Invalid source map: ${path}`);
      continue;
    }
    const source = posix.normalize(
      posix.join(posix.dirname(path), map.sources[0]),
    );
    const expected = compiled
      .replace(/^dist\//, "src/")
      .replace(/\.(?:d\.ts|js)$/, ".ts");
    if (source !== expected)
      errors.push(`Unexpected source map target: ${path} -> ${source}`);
    else if (!contents.has(source))
      errors.push(`Missing source map target: ${path} -> ${source}`);
    if (
      !contents
        .get(compiled)
        .trimEnd()
        .endsWith(`//# sourceMappingURL=${posix.basename(path)}`)
    )
      errors.push(`Missing source map reference: ${compiled}`);
  }
  return errors;
}

/** Find repository policy from the package directory, as package scripts run there. */
function findUp(name, directory = process.cwd()) {
  for (;;) {
    const path = join(directory, name);
    if (existsSync(path)) return path;
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot find ${name}`);
    directory = parent;
  }
}

export async function main() {
  mkdirSync("reports", { recursive: true });
  const destination = mkdtempSync(join(tmpdir(), "toolgrain-size-"));
  let report;
  try {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    const budgets = JSON.parse(
      readFileSync(findUp("package-size.config.json"), "utf8"),
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
      .filter((path) => /\.(?:js|d\.ts)(?:\.map)?$/.test(path));
    const sourceFiles = existsSync("src")
      ? readdirSync("src", { recursive: true }).map(
          (path) => `src/${path.replaceAll("\\", "/")}`,
        )
      : undefined;
    report = {
      name: manifest.name,
      ...checkSize(
        files,
        bytes.byteLength,
        budgets[manifest.name],
        compiledFiles,
        sourceFiles,
      ),
    };
    if (budgets[manifest.name].sourceMaps) {
      const contents = new Map(
        await Promise.all(
          [...entries].map(async ([path, file]) => [
            path.replace(/^package\//, ""),
            await file.text(),
          ]),
        ),
      );
      report.errors.push(...checkSourceMaps(contents));
      report.status = report.errors.length ? "failed" : "passed";
    }
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
