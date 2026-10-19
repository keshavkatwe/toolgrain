import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const version = "2.11.0";
const protocolVersion = "2026-07-28";
const legacyProtocolVersion = "2025-06-18";
let temporary;
let env;

const children = new Map();
let interruption;
let failure;

function signalChild(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function launch(command, args, options = {}) {
  if (interruption) throw new Error(`Interrupted by ${interruption}`);
  const child = spawn(command, args, {
    cwd: temporary,
    env,
    detached: process.platform !== "win32",
    stdio: "pipe",
    ...options,
  });
  // Always observe errors and close, including failures before a PID is assigned.
  child.on("error", () => {});
  const closed = new Promise((resolve) => child.once("close", resolve));
  children.set(child, closed);
  return child;
}

async function stop(child) {
  signalChild(child, "SIGTERM");
  await Promise.race([children.get(child), delay(2000)]);
  signalChild(child, "SIGKILL");
  await children.get(child);
  children.delete(child);
}

function interrupt(signal) {
  interruption = signal;
  failure ??= new Error(`Interrupted by ${signal}`);
  process.exitCode = signal === "SIGINT" ? 130 : 143;
  for (const child of children.keys()) signalChild(child, "SIGKILL");
}

function run(command, args, cwd = temporary) {
  return new Promise((resolve, reject) => {
    const child = launch(command, args, { cwd });
    let stdout = "";
    let stderr = "";
    let failure;
    const timer = setTimeout(() => {
      failure = new Error(`Command timed out: ${command}`);
      signalChild(child, "SIGKILL");
    }, 30000);
    for (const [stream, capture] of [
      [
        child.stdout,
        (text) => {
          stdout += text;
        },
      ],
      [
        child.stderr,
        (text) => {
          stderr += text;
        },
      ],
    ]) {
      stream.setEncoding("utf8");
      stream.on("data", (text) => {
        capture(text);
        if (stdout.length + stderr.length > 1024 * 1024) {
          failure = new Error(`Command output exceeded 1 MiB: ${command}`);
          signalChild(child, "SIGKILL");
        }
      });
    }
    child.on("error", (error) => {
      failure = error;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signalChild(child, "SIGKILL");
      children.delete(child);
      if (interruption) failure = new Error(`Interrupted by ${interruption}`);
      if (failure || code === null)
        reject(
          Object.assign(failure ?? new Error("Command terminated"), {
            stdout,
            stderr,
          }),
        );
      else resolve({ code, stdout, stderr });
    });
  });
}

async function availablePort() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

/** Verify both examples, both protocol eras, with the pinned Inspector CLI. */
export async function main(args) {
  const { values } = parseArgs({
    args,
    options: { "inspector-cli": { type: "string" } },
  });
  temporary = await mkdtemp(join(tmpdir(), "toolgrain-inspector-check-"));
  env = {
    ...process.env,
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
    MCP_STORAGE_DIR: temporary,
    MCP_INSPECTOR_SECRET_STORE: "memory",
  };
  const inspector = values["inspector-cli"]
    ? [process.execPath, [values["inspector-cli"]]]
    : [
        "bun",
        [
          "x",
          "--package",
          `@modelcontextprotocol/inspector@${version}`,
          "mcp-inspector",
        ],
      ];

  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);

  const results = [];
  let revision;
  try {
    const source = await run("git", ["rev-parse", "HEAD"], root);
    assert.equal(source.code, 0, source.stderr);
    revision = source.stdout.trim();
    const installed = await run(inspector[0], [
      ...inspector[1],
      "--cli",
      "--version",
    ]);
    assert.equal(installed.code, 0, installed.stderr);
    assert.equal(installed.stdout.trim(), version);
    const port = await availablePort();
    const url = `http://127.0.0.1:${port}/mcp`;
    const http = launch(
      process.execPath,
      [join(root, "apps/http-example/dist/index.js")],
      { cwd: root, env: { ...env, PORT: String(port) }, stdio: "pipe" },
    );
    let diagnostics = "";
    http.stdout.on("data", (chunk) => {
      diagnostics = (diagnostics + chunk.toString()).slice(-16000);
    });
    http.stderr.on("data", (chunk) => {
      diagnostics = (diagnostics + chunk.toString()).slice(-16000);
    });
    const deadline = Date.now() + 10000;
    for (;;) {
      if (interruption) throw new Error(`Interrupted by ${interruption}`);
      assert.equal(http.exitCode, null, diagnostics);
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(500),
        });
        if (response.status === 405) break;
      } catch {
        // The example may still be starting.
      }
      assert(
        Date.now() < deadline,
        `HTTP example did not start: ${diagnostics}`,
      );
      await delay(100);
    }
    const config = join(temporary, "servers.json");
    await writeFile(
      config,
      JSON.stringify({
        mcpServers: {
          stdio: {
            command: process.execPath,
            args: [join(root, "apps/stdio-example/dist/index.js")],
          },
          http: { url, type: "streamable-http" },
        },
      }),
    );
    for (const transport of ["stdio", "http"]) {
      for (const era of ["modern", "legacy"]) {
        async function check(name, args, verify, mode = era) {
          const result = await run(inspector[0], [
            ...inspector[1],
            "--cli",
            "--config",
            config,
            "--server",
            transport,
            "--protocol-era",
            mode,
            "--connect-timeout",
            "5000",
            "--stored-auth-only",
            "--format",
            "json",
            ...args,
          ]);
          const entry = {
            transport,
            check: name,
            era: mode,
            status: "failed",
            ...result,
          };
          results.push(entry);
          verify(result);
          entry.status = "passed";
          console.log(`PASS ${transport} ${mode}: ${name}`);
        }
        function discovery(result) {
          assert.equal(result.code, 0, result.stderr);
          const discovered = JSON.parse(result.stdout).result;
          assert.equal(
            discovered.protocolVersion,
            era === "modern" ? protocolVersion : legacyProtocolVersion,
          );
          assert.deepEqual(discovered.capabilities, { tools: {} });
          assert.equal(
            discovered.serverInfo.name,
            transport === "stdio" ? "toolgrain-stdio-example" : "hello-http",
          );
        }
        await check("discovery", ["--method", "initialize"], discovery);
        await check(
          "tool schema",
          ["--method", "tools/list", "--strict"],
          (r) => {
            assert.equal(r.code, 0, r.stderr);
            const { tools } = JSON.parse(r.stdout).result;
            assert.equal(tools.length, 1);
            assert.equal(tools[0].name, "greet");
            assert.equal(tools[0].inputSchema.type, "object");
            assert.deepEqual(tools[0].inputSchema.required, ["name"]);
            assert.equal(tools[0].title, "Greeting");
            assert.equal(tools[0].annotations.readOnlyHint, true);
            assert.equal(tools[0].outputSchema.type, "object");
            assert.deepEqual(tools[0].outputSchema.required, ["message"]);
          },
        );
        for (const name of ["Ada", "Zoë 世界"]) {
          await check(
            `greet ${name}`,
            [
              "--method",
              "tools/call",
              "--tool-name",
              "greet",
              "--tool-args-json",
              JSON.stringify({ name }),
            ],
            (r) => {
              assert.equal(r.code, 0, r.stderr);
              const result = JSON.parse(r.stdout).result;
              assert.equal(result.isError, undefined);
              assert.deepEqual(result.structuredContent, {
                message: `Hello, ${name}!`,
              });
              assert.deepEqual(
                JSON.parse(result.content[0].text),
                result.structuredContent,
              );
            },
          );
        }
        for (const name of ["", 42]) {
          await check(
            `invalid input ${JSON.stringify(name)}`,
            [
              "--method",
              "tools/call",
              "--tool-name",
              "greet",
              "--tool-args-json",
              JSON.stringify({ name }),
            ],
            (r) => {
              assert.equal(r.code, 5, r.stderr);
              const result = JSON.parse(r.stdout).result;
              assert.equal(result.isError, true);
              assert.match(result.content[0].text, /name:/);
            },
          );
        }
        await check(
          "client rejects an unlisted tool",
          ["--method", "tools/call", "--tool-name", "missing"],
          (r) => {
            assert.notEqual(r.code, 0);
            assert.match(r.stderr, /"code":"tool_not_found"/);
            assert.match(r.stderr, /Tool 'missing' not found on server/);
            assert.equal(r.stdout.trim(), "");
          },
        );
        if (era === "modern")
          await check(
            "automatic discovery",
            ["--method", "initialize"],
            discovery,
            "auto",
          );
      }
    }
  } catch (error) {
    failure = error;
    process.exitCode ??= 1;
    console.error(error);
  } finally {
    await Promise.all([...children.keys()].map(stop));
    await rm(temporary, { recursive: true, force: true });
    const destination = join(root, "reports/compatibility");
    await mkdir(destination, { recursive: true });
    const writeReport = () =>
      writeFile(
        join(destination, "inspector.json"),
        `${JSON.stringify(
          {
            verifiedAt: new Date().toISOString(),
            status: failure ? "failed" : "passed",
            ...(failure ? { error: failure.message } : {}),
            revision,
            node: process.version,
            inspector: version,
            protocolVersions: [protocolVersion, legacyProtocolVersion],
            results,
          },
          null,
          2,
        )}\n`,
      );
    await writeReport();
    if (interruption) await writeReport();
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    if (!failure)
      console.log(
        `Verified ${results.length} checks. Report: reports/compatibility/inspector.json`,
      );
  }
}
