import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";

// Changesets 3 falls back to npm for Bun workspaces. Keep its native planner,
// artifact format, publisher and tags; adapt only the package-manager boundary.
export function runChangesetsNpm(
  args,
  { cwd = process.cwd(), env = process.env } = {},
) {
  const [command, ...rest] = args;
  assert(
    ["info", "view", "pack", "publish"].includes(command),
    "Unsupported Changesets npm command",
  );
  if (command === "pack") {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        "pack-destination": { type: "string" },
        json: { type: "boolean" },
      },
    });
    assert.equal(positionals.length, 1, "Expected one package directory");
    assert(
      values["pack-destination"] && values.json,
      "Expected Changesets JSON pack arguments",
    );
    const directory = resolve(cwd, positionals[0]);
    const {
      name,
      version,
      private: privatePackage,
    } = JSON.parse(readFileSync(join(directory, "package.json")));
    assert(
      /^@toolgrain\/(protocol|mcp|http|node|jwt|clerk)$/.test(name) &&
        !privatePackage,
      "Only Toolgrain libraries may be packed",
    );
    const destination = resolve(cwd, values["pack-destination"]);
    mkdirSync(destination, { recursive: true });
    const filename = `${name.slice(1).replace("/", "-")}-${version}.tgz`;
    const result = spawnSync(
      "bun",
      [
        "pm",
        "pack",
        "--ignore-scripts",
        "--quiet",
        "--filename",
        join(destination, filename),
      ],
      { cwd: directory, env, encoding: "utf8" },
    );
    if (result.error) throw result.error;
    return result.status === 0
      ? {
          status: 0,
          stdout: JSON.stringify([{ filename }]),
          stderr: result.stderr,
        }
      : result;
  }
  const cli = env.TOOLGRAIN_NPM_CLI;
  assert(
    cli && isAbsolute(cli),
    "TOOLGRAIN_NPM_CLI must name the pinned npm-cli.js",
  );
  const forwarded = [...rest];
  if (command === "publish") {
    assert(
      rest[0]?.endsWith(".tgz") && !rest[0].startsWith("-"),
      "Publication requires a Changesets packed archive",
    );
    forwarded[0] = resolve(cwd, rest[0]);
    forwarded.push("--ignore-scripts");
  }
  // npm's devEngines check intentionally rejects npm inside the Bun checkout.
  // Registry reads and archive publication do not need workspace discovery.
  const temporary = mkdtempSync(join(tmpdir(), "toolgrain-changesets-npm-"));
  try {
    const result = spawnSync(process.execPath, [cli, command, ...forwarded], {
      cwd: temporary,
      env,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    return result;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function main(args = process.argv.slice(2)) {
  try {
    const result = runChangesetsNpm(args);
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.log(
      JSON.stringify({ error: { code: "ETOOLGRAIN", summary: error.message } }),
    );
    process.exitCode = 1;
  }
}
