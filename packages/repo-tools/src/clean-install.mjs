import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { startArchiveRegistry } from "./archive-registry.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const libraries = ["protocol", "mcp", "http", "node", "jwt", "clerk"];
const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));
const inside = (parent, path) => {
  const fromParent = relative(parent, path);
  return (
    !isAbsolute(fromParent) &&
    fromParent !== ".." &&
    !fromParent.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  );
};

/** Installed libraries must be real archive contents, never workspace links. */
export function inspectInstallation(directory, packages) {
  const destination = realpathSync(directory);
  for (const { name, version } of packages) {
    const installed = join(directory, "node_modules", name);
    assert(!lstatSync(installed).isSymbolicLink(), `${name} is a symlink`);
    assert(
      inside(destination, realpathSync(installed)),
      `${name} resolves outside the consumer`,
    );
    const manifest = readJSON(join(installed, "package.json"));
    assert.equal(manifest.name, name);
    assert.equal(manifest.version, version);
    for (const [dependency, specifier] of Object.entries({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    })) {
      assert(
        !/^(workspace:|link:|file:)/.test(specifier),
        `${name}: nonportable dependency ${dependency}: ${specifier}`,
      );
    }
  }
}

/** Install real tarballs outside the repository, then compile and run a consumer. */
export async function main(args = []) {
  assert.equal(
    process.versions.bun,
    undefined,
    "Run clean-install with Node; --runtime selects the consumer runtime",
  );
  const { values } = parseArgs({
    args,
    options: {
      runtime: { type: "string", default: "node" },
      "package-manager": { type: "string", default: "npm" },
      typescript: { type: "string" },
      zod: { type: "string" },
    },
  });
  assert(["node", "bun"].includes(values.runtime), "Unknown runtime");
  const manager = values["package-manager"];
  assert(["npm", "bun"].includes(manager), "Unknown package manager");
  const runtime = values.runtime === "bun" ? "bun" : process.execPath;
  const runtimeArgs = values.runtime === "bun" ? ["--no-install"] : [];
  const policy = readJSON(join(root, "support-policy.json"));
  const temporary = mkdtempSync(join(tmpdir(), "toolgrain-clean-install-"));
  const results = [];
  let failure;
  let registry;
  let runtimeVersion;
  const env = { ...process.env };
  // Do not inherit loaders or module lookup paths from the developer's process.
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  if (process.platform === "win32") {
    // Avoid duplicate case-insensitive PATH keys when spawning on Windows.
    for (const key of Object.keys(env))
      if (key !== "PATH" && key.toUpperCase() === "PATH") {
        env.PATH = env[key];
        delete env[key];
      }
  }
  env.PATH = `${dirname(process.execPath)}${delimiter}${env.PATH ?? ""}`;
  // npm's cache/logs belong to this disposable consumer, too.
  env.npm_config_cache = join(temporary, "npm-cache");
  env.npm_config_update_notifier = "false";
  env.BUN_INSTALL_CACHE_DIR = join(temporary, "bun-cache");
  env.NODE_ENV = "development";
  env.TOOLGRAIN_EXPECT_RUNTIME = values.runtime;

  // Windows .cmd shims cannot be spawned without a shell. Invoke npm's JS
  // entry point with Node instead; all arguments remain literal argv values.
  let npm = "npm";
  let npmArgs = [];
  if (process.platform === "win32") {
    const cli = env.PATH.split(delimiter)
      .map((directory) => join(directory, "node_modules/npm/bin/npm-cli.js"))
      .find(existsSync);
    assert(cli, "Cannot locate npm-cli.js on PATH");
    npm = process.execPath;
    npmArgs = [cli];
  }

  async function run(check, command, args, cwd = temporary) {
    console.log(`Clean install: ${check}`);
    const entry = { check, status: "failed" };
    results.push(entry);
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
      // Cold compiler downloads can exceed a minute; execution checks remain bounded separately.
      timeout: check.startsWith(`${manager} install `) ? 120_000 : 60_000,
      killSignal: "SIGKILL",
    });
    const status = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(status, 0, `${check} failed (${child.signalCode ?? status})`);
    entry.status = "passed";
  }

  const packages = [];
  try {
    runtimeVersion = execFileSync(runtime, ["--version"], {
      encoding: "utf8",
      env,
    }).trim();
    for (const name of libraries) {
      const directory = join(root, "packages", name);
      packages.push({
        directory,
        ...readJSON(join(directory, "package.json")),
      });
      assert.deepEqual(
        packages.at(-1).engines,
        {
          node: policy.node.range,
          bun: policy.bun.range,
        },
        "Library engines must match support-policy.json",
      );
    }
    assert(
      !inside(realpathSync(root), realpathSync(temporary)),
      "The temporary consumer must be outside the repository; change TMPDIR",
    );
    const archives = join(temporary, "archives");
    mkdirSync(archives);
    const packed = [];
    for (const manifest of packages) {
      const archive = join(archives, `${manifest.name.split("/")[1]}.tgz`);
      await run(
        `pack ${manifest.name}`,
        "bun",
        ["pm", "pack", "--ignore-scripts", "--quiet", "--filename", archive],
        manifest.directory,
      );
      // Read the actual archive: Bun rewrites workspace dependency versions.
      packed.push({
        archive,
        manifest: JSON.parse(
          execFileSync("tar", ["-xOf", archive, "package/package.json"], {
            encoding: "utf8",
            timeout: 10000,
          }),
        ),
      });
      assert.deepEqual(packed.at(-1).manifest.engines, manifest.engines);
    }
    const mcp = packages.find((manifest) => manifest.name === "@toolgrain/mcp");
    const aliases = readJSON(
      join(root, "packages/repo-tools/package.json"),
    ).dependencies;
    assert.equal(
      aliases["typescript-minimum"],
      `npm:typescript@${policy.typescript.minimum}`,
    );
    assert.equal(aliases["zod-minimum"], `npm:zod@${policy.zod.minimum}`);
    assert.equal(mcp.peerDependencies.zod, policy.zod.range);
    const node = packages.find(
      (manifest) => manifest.name === "@toolgrain/node",
    );
    registry = await startArchiveRegistry(packed);
    const install = async (consumer, dependencies, tools = {}) => {
      writeFileSync(
        join(consumer, ".npmrc"),
        `@toolgrain:registry=${registry.url}/\n`,
      );
      writeFileSync(
        join(consumer, "package.json"),
        `${JSON.stringify(
          {
            name: "toolgrain-clean-install-consumer",
            version: "0.0.0",
            private: true,
            type: "module",
            dependencies,
            devDependencies: {
              typescript: values.typescript ?? mcp.devDependencies.typescript,
              "typescript-minimum": `npm:typescript@${policy.typescript.minimum}`,
              "@types/node": node.devDependencies["@types/node"],
              ...tools,
            },
          },
          null,
          2,
        )}\n`,
      );
      await run(
        `${manager} install ${Object.keys(dependencies).join(", ")}`,
        manager === "npm" ? npm : "bun",
        manager === "npm"
          ? [
              ...npmArgs,
              "install",
              "--ignore-scripts",
              "--include=dev",
              "--no-audit",
              "--no-fund",
              "--fetch-retries=0",
              "--fetch-timeout=30000",
            ]
          : ["install", "--ignore-scripts"],
        consumer,
      );
      inspectInstallation(
        consumer,
        packages.filter(({ name }) =>
          existsSync(join(consumer, "node_modules", name)),
        ),
      );
      await run(
        "runtime dependency tree",
        npm,
        [...npmArgs, "ls", "--all", "--omit=dev"],
        consumer,
      );
    };
    for (const manifest of packages) {
      const consumer = join(temporary, `entry-${manifest.name.split("/")[1]}`);
      mkdirSync(consumer);
      await install(consumer, {
        [manifest.name]: manifest.version,
        ...(manifest.name === "@toolgrain/protocol"
          ? {}
          : { zod: values.zod ?? mcp.devDependencies.zod }),
      });
      // Import before adding any other Toolgrain entry package to the project.
      cpSync(
        new URL("../fixtures/clean-install/entry-runtime.mjs", import.meta.url),
        join(consumer, "entry-runtime.mjs"),
      );
      await run(
        `isolated runtime ${manifest.name}`,
        runtime,
        [...runtimeArgs, "entry-runtime.mjs", manifest.name],
        consumer,
      );
      cpSync(
        join(manifest.directory, "smoke/consumer.mts"),
        join(consumer, "consumer.mts"),
      );
      const config = readJSON(
        new URL("../fixtures/clean-install/tsconfig.json", import.meta.url),
      );
      config.compilerOptions.noEmit = true;
      writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify(config));
      for (const compiler of ["typescript-minimum", "typescript"])
        await run(
          `isolated declarations ${manifest.name} / ${compiler}`,
          process.execPath,
          [
            join(consumer, "node_modules", compiler, "bin/tsc"),
            "-p",
            "tsconfig.json",
          ],
          consumer,
        );
    }
    const consumer = join(temporary, "consumer");
    cpSync(new URL("../fixtures/clean-install/", import.meta.url), consumer, {
      recursive: true,
    });
    await install(
      consumer,
      {
        ...Object.fromEntries(
          packages.map(({ name, version }) => [name, version]),
        ),
        zod: values.zod ?? mcp.devDependencies.zod,
      },
      {
        jose: packages.find(({ name }) => name === "@toolgrain/jwt")
          .dependencies.jose,
      },
    );
    await run(
      "strict TypeScript consumer",
      process.execPath,
      [
        join(consumer, "node_modules/typescript/bin/tsc"),
        "-p",
        "tsconfig.json",
      ],
      consumer,
    );
    await run(
      `${values.runtime} consumer over stdio and HTTP`,
      runtime,
      values.runtime === "bun"
        ? ["test", "--no-install", "./runtime.mjs"]
        : ["--test", "runtime.mjs"],
      consumer,
    );
  } catch (error) {
    failure = error;
    process.exitCode = 1;
    console.error(error);
  } finally {
    await registry?.close();
    rmSync(temporary, { recursive: true, force: true });
    const reports = join(root, "reports");
    mkdirSync(reports, { recursive: true });
    writeFileSync(
      join(reports, "clean-install.json"),
      `${JSON.stringify(
        {
          status: failure ? "failed" : "passed",
          ...(failure ? { error: failure.message } : {}),
          node: process.version,
          platform: process.platform,
          architecture: process.arch,
          runtime: values.runtime,
          runtimeVersion,
          packageManager: manager,
          packages: packages.map(({ name, version }) => ({ name, version })),
          results,
        },
        null,
        2,
      )}\n`,
    );
  }
}
