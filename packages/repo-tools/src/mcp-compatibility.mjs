import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));

function dependency(request, name) {
  const manifest = request.resolve(`${name}/package.json`);
  return { directory: dirname(manifest), version: readJSON(manifest).version };
}

function run(label, script, directory) {
  console.log(`MCP compatibility: ${label}`);
  const result = spawnSync("node", script, {
    cwd: directory,
    stdio: "inherit",
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) console.error(`Failed: ${label}`);
  return result.status === 0;
}

/** Check compiled consumers without falling back to workspace package resolution. */
export function main() {
  const directory = process.cwd();
  const manifest = readJSON(join(directory, "package.json"));
  const isMcp = manifest.name === "@toolgrain/mcp";
  if (
    !["@toolgrain/mcp", "@toolgrain/jwt", "@toolgrain/clerk"].includes(
      manifest.name,
    )
  )
    throw new Error(
      "Run mcp-compat from packages/mcp, packages/jwt, or packages/clerk",
    );
  const mcp = isMcp
    ? directory
    : join(directory, "node_modules/@toolgrain/mcp");
  const consumerRequire = createRequire(join(directory, "package.json"));
  const compilers = [
    dependency(require, "typescript-minimum"),
    dependency(consumerRequire, "typescript"),
  ];
  const schemas = [
    dependency(require, "zod-minimum"),
    dependency(consumerRequire, "zod"),
  ];
  if (
    readJSON(join(mcp, "package.json")).peerDependencies.zod !==
    `^${schemas[0].version}`
  )
    throw new Error("Update zod-minimum to match MCP's Zod peer floor");
  const protocol = join(mcp, "node_modules/@toolgrain/protocol");
  let passed = true;
  for (const schema of schemas) {
    const temporary = mkdtempSync(join(tmpdir(), "toolgrain-mcp-compat-"));
    try {
      for (const [name, source] of [
        ...(!isMcp ? [["@toolgrain/mcp", mcp]] : []),
        [manifest.name, directory],
        ["@toolgrain/protocol", protocol],
      ]) {
        const destination = join(temporary, "node_modules", name);
        mkdirSync(destination, { recursive: true });
        cpSync(join(source, "package.json"), join(destination, "package.json"));
        cpSync(join(source, "dist"), join(destination, "dist"), {
          recursive: true,
        });
        if (name === "@toolgrain/mcp")
          cpSync(join(source, "src"), join(destination, "src"), {
            recursive: true,
          });
      }
      cpSync(schema.directory, join(temporary, "node_modules/zod"), {
        recursive: true,
        dereference: true,
      });
      for (const name of isMcp
        ? ["consumer.mts", "runtime.mjs"]
        : ["consumer.mts"])
        cpSync(join(directory, "smoke", name), join(temporary, name));
      cpSync(
        resolve(directory, "../../tsconfig.base.json"),
        join(temporary, "tsconfig.base.json"),
      );
      const config = readJSON(join(directory, "smoke/tsconfig.json"));
      writeFileSync(
        join(temporary, "tsconfig.json"),
        JSON.stringify({
          ...config,
          extends: "./tsconfig.base.json",
          // Check declarations too, with no ambient workspace types.
          compilerOptions: {
            ...config.compilerOptions,
            skipLibCheck: false,
            types: [],
          },
        }),
      );
      if (
        isMcp &&
        !run(
          `Zod ${schema.version} runtime`,
          ["--enable-source-maps", "runtime.mjs"],
          temporary,
        )
      )
        passed = false;
      for (const compiler of compilers) {
        if (
          !run(
            `TypeScript ${compiler.version} / Zod ${schema.version}`,
            [join(compiler.directory, "bin/tsc"), "-p", "tsconfig.json"],
            temporary,
          )
        )
          passed = false;
      }
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  if (!passed) process.exitCode = 1;
}
