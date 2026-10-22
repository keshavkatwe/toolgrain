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
export async function main() {
  const temporary = mkdtempSync(join(tmpdir(), "toolgrain-clean-install-"));
  const results = [];
  let failure;
  let registry;
  const env = { ...process.env };
  // Do not inherit loaders or module lookup paths from the developer's process.
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  env.PATH = `${dirname(process.execPath)}${delimiter}${env.PATH ?? ""}`;
  // npm's cache/logs belong to this disposable consumer, too.
  env.npm_config_cache = join(temporary, "npm-cache");
  env.npm_config_update_notifier = "false";

  async function run(check, command, args, cwd = temporary) {
    console.log(`Clean install: ${check}`);
    const entry = { check, status: "failed" };
    results.push(entry);
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
      timeout: 60_000,
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
    for (const name of libraries) {
      const directory = join(root, "packages", name);
      packages.push({
        directory,
        ...readJSON(join(directory, "package.json")),
      });
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
    }
    const mcp = packages.find((manifest) => manifest.name === "@toolgrain/mcp");
    const node = packages.find(
      (manifest) => manifest.name === "@toolgrain/node",
    );
    registry = await startArchiveRegistry(packed);
    const install = async (consumer, dependencies) => {
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
              typescript: mcp.devDependencies.typescript,
              "@types/node": node.devDependencies["@types/node"],
            },
          },
          null,
          2,
        )}\n`,
      );
      await run(
        `npm install ${Object.keys(dependencies).join(", ")}`,
        "npm",
        [
          "install",
          "--ignore-scripts",
          "--include=dev",
          "--no-audit",
          "--no-fund",
          "--fetch-retries=0",
          "--fetch-timeout=30000",
        ],
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
        "npm",
        ["ls", "--all", "--omit=dev"],
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
          : { zod: mcp.devDependencies.zod }),
      });
      // Import before adding any other Toolgrain entry package to the project.
      cpSync(
        new URL("../fixtures/clean-install/entry-runtime.mjs", import.meta.url),
        join(consumer, "entry-runtime.mjs"),
      );
      await run(
        `isolated runtime ${manifest.name}`,
        process.execPath,
        ["entry-runtime.mjs", manifest.name],
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
      await run(
        `isolated declarations ${manifest.name}`,
        process.execPath,
        [
          join(consumer, "node_modules/typescript/bin/tsc"),
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
    await install(consumer, {
      ...Object.fromEntries(
        packages.map(({ name, version }) => [name, version]),
      ),
      zod: mcp.devDependencies.zod,
    });
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
      "Node consumer over stdio and HTTP",
      process.execPath,
      ["--test", "runtime.mjs"],
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
          packages: packages.map(({ name, version }) => ({ name, version })),
          results,
        },
        null,
        2,
      )}\n`,
    );
  }
}
