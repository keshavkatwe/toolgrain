import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startArchiveRegistry } from "../src/archive-registry.mjs";
import { inspectInstallation } from "../src/clean-install.mjs";

test("clean consumers reject workspace links, wrong packages, and nonportable runtime dependencies", () => {
  const temporary = mkdtempSync(join(tmpdir(), "toolgrain-install-policy-"));
  const consumer = join(temporary, "consumer");
  const installed = join(consumer, "node_modules/@toolgrain/mcp");
  const expected = [{ name: "@toolgrain/mcp", version: "0.0.0" }];
  const manifest = {
    ...expected[0],
    dependencies: { "@toolgrain/protocol": "0.0.0" },
  };
  const write = (value) =>
    writeFileSync(join(installed, "package.json"), JSON.stringify(value));
  try {
    mkdirSync(installed, { recursive: true });
    write(manifest);
    assert.doesNotThrow(() => inspectInstallation(consumer, expected));
    for (const changed of [{ name: "wrong" }, { version: "1.0.0" }]) {
      write({ ...manifest, ...changed });
      assert.throws(() => inspectInstallation(consumer, expected));
    }
    for (const field of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      for (const specifier of [
        "workspace:*",
        "link:../protocol",
        "file:../protocol",
      ]) {
        write({ ...manifest, [field]: { "@toolgrain/protocol": specifier } });
        assert.throws(
          () => inspectInstallation(consumer, expected),
          /nonportable dependency/,
        );
      }
    }
    // Dev dependencies are not consumed from installed archives.
    write({
      ...manifest,
      devDependencies: { "@toolgrain/repo-tools": "workspace:*" },
    });
    assert.doesNotThrow(() => inspectInstallation(consumer, expected));
    rmSync(installed, { recursive: true });
    assert.throws(() => inspectInstallation(consumer, expected), /ENOENT/);
    const workspace = join(temporary, "workspace");
    mkdirSync(workspace);
    writeFileSync(join(workspace, "package.json"), JSON.stringify(manifest));
    symlinkSync(workspace, installed, "dir");
    assert.throws(() => inspectInstallation(consumer, expected), /symlink/);
    rmSync(installed);
    // Also catch a symlinked parent, even when the package directory is real.
    rmSync(join(consumer, "node_modules/@toolgrain"), { recursive: true });
    symlinkSync(temporary, join(consumer, "node_modules/@toolgrain"), "dir");
    mkdirSync(join(temporary, "mcp"));
    assert.throws(
      () => inspectInstallation(consumer, expected),
      /outside the consumer/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("package command forwards Turbo flags and schedules the uncached install after library checks", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const temporary = mkdtempSync(join(tmpdir(), "toolgrain-package-args-"));
  try {
    const { scripts } = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    );
    writeFileSync(
      join(temporary, "package.json"),
      JSON.stringify({ name: "args-consumer", private: true, scripts }),
    );
    mkdirSync(join(temporary, "node_modules/.bin"), { recursive: true });
    writeFileSync(
      join(temporary, "node_modules/.bin/turbo"),
      '#!/bin/sh\nprintf "%s\\n" "$@" > turbo-args.txt\n',
      { mode: 0o755 },
    );
    const args = ["--filter=@toolgrain/mcp", "--force", "--dry=json"];
    const result = spawnSync("bun", ["run", "test:package", ...args], {
      cwd: temporary,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      readFileSync(join(temporary, "turbo-args.txt"), "utf8")
        .trim()
        .split("\n"),
      ["run", "test:package", "test:clean-install", ...args],
    );
    const plan = (options = []) => {
      const result = spawnSync(
        "bun",
        ["run", "test:package", ...options, "--dry=json"],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 10000,
          maxBuffer: 4 * 1024 * 1024,
        },
      );
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    const install = plan().tasks.find(
      ({ taskId }) => taskId === "//#test:clean-install",
    );
    assert.equal(install.resolvedTaskDefinition.cache, false);
    assert.deepEqual(
      install.dependencies.toSorted(),
      ["clerk", "http", "jwt", "mcp", "node", "protocol"].map(
        (name) => `@toolgrain/${name}#test:package`,
      ),
    );
    const filtered = plan(["--filter=@toolgrain/mcp"]);
    assert.deepEqual(filtered.packages, ["@toolgrain/mcp"]);
    assert(
      !filtered.tasks.some(({ taskId }) => taskId === "//#test:clean-install"),
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

function command(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      timeout: 20000,
      killSignal: "SIGKILL",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (data) => {
      stdout += data;
    });
    child.stderr.setEncoding("utf8").on("data", (data) => {
      stderr += data;
    });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("single-entry archive installs expose missing dependencies and preserve version constraints", {
  timeout: 60000,
}, async () => {
  const temporary = mkdtempSync(
    join(tmpdir(), "toolgrain-dependency-regression-"),
  );
  const entry = {
    name: "@toolgrain/node",
    version: "1.0.0",
    type: "module",
    exports: "./index.js",
    files: ["index.js"],
  };
  const dependency = { ...entry, name: "@toolgrain/http" };
  const pack = (manifest, source, label) => {
    const directory = join(temporary, label);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
    writeFileSync(join(directory, "index.js"), source);
    const archive = join(temporary, `${label}.tgz`);
    const packed = spawnSync(
      "bun",
      ["pm", "pack", "--ignore-scripts", "--quiet", "--filename", archive],
      { cwd: directory, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(packed.status, 0, packed.stderr);
    return {
      archive,
      manifest: JSON.parse(
        execFileSync("tar", ["-xOf", archive, "package/package.json"], {
          encoding: "utf8",
        }),
      ),
    };
  };
  try {
    const http = pack(dependency, "export const value = 42;\n", "http");
    for (const [label, dependencies] of [
      ["valid", { "@toolgrain/http": "1.0.0" }],
      ["missing", {}],
      ["incompatible", { "@toolgrain/http": "2.0.0" }],
    ]) {
      const node = pack(
        { ...entry, dependencies },
        'export { value } from "@toolgrain/http";\n',
        label,
      );
      const registry = await startArchiveRegistry([http, node]);
      try {
        const consumer = join(temporary, `consumer-${label}`);
        mkdirSync(consumer);
        writeFileSync(
          join(consumer, "package.json"),
          JSON.stringify({
            name: "isolated-consumer",
            private: true,
            type: "module",
            dependencies: { "@toolgrain/node": "1.0.0" },
          }),
        );
        writeFileSync(
          join(consumer, ".npmrc"),
          `registry=${registry.url}/\ncache=${join(temporary, "npm-cache")}\n`,
        );
        const installed = await command(
          "npm",
          [
            "install",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "--fetch-retries=0",
          ],
          consumer,
        );
        if (label === "incompatible") {
          assert.notEqual(installed.status, 0);
          assert.match(installed.stderr, /ETARGET|No matching version/);
          continue;
        }
        assert.equal(installed.status, 0, installed.stderr);
        const imported = await command(
          "node",
          [
            "--input-type=module",
            "-e",
            'import {value} from "@toolgrain/node"; if(value !== 42) process.exit(1);',
          ],
          consumer,
        );
        if (label === "valid")
          assert.equal(imported.status, 0, imported.stderr);
        else {
          assert.notEqual(imported.status, 0);
          assert.match(imported.stderr, /ERR_MODULE_NOT_FOUND/);
          assert.match(imported.stderr, /@toolgrain\/http/);
        }
      } finally {
        await registry.close();
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
