import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { type JSONRPCResponse, PROTOCOL_VERSION } from "@toolgrain/protocol";
import { expect, it } from "vitest";

const meta = {
  "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
  "io.modelcontextprotocol/clientCapabilities": {},
};
const request = (
  id: number,
  method: string,
  params: Record<string, unknown> = {},
) => ({ jsonrpc: "2.0", id, method, params: { _meta: meta, ...params } });

function launch() {
  const child: ChildProcessWithoutNullStreams = spawn(
    process.execPath,
    [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    { stdio: "pipe" },
  );
  const messages: JSONRPCResponse[] = [];
  const pending: {
    resolve: (message: JSONRPCResponse) => void;
    reject: (error: Error) => void;
  }[] = [];
  let stderr = "";
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    try {
      const message: JSONRPCResponse = JSON.parse(line);
      const waiter = pending.shift();
      if (waiter) waiter.resolve(message);
      else messages.push(message);
    } catch (error) {
      for (const waiter of pending.splice(0))
        waiter.reject(
          error instanceof Error ? error : new Error("Invalid output"),
        );
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      for (const waiter of pending.splice(0))
        waiter.reject(new Error(`Server exited with ${code}: ${stderr}`));
      resolve(code);
    });
  });
  return {
    child,
    exited,
    stderr: () => stderr,
    next() {
      const message = messages.shift();
      if (message) return Promise.resolve(message);
      return new Promise<JSONRPCResponse>((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    },
    async dispose() {
      lines.close();
      if (child.exitCode === null) child.kill();
      await exited;
    },
  };
}

it("runs discovery → listing → execution through compiled packages and real stdio", async () => {
  const client = launch();
  try {
    client.child.stdin.write(
      `${JSON.stringify(request(1, "server/discover"))}\n`,
    );
    expect(await client.next()).toMatchObject({
      id: 1,
      result: {
        supportedVersions: [PROTOCOL_VERSION],
        capabilities: { tools: {} },
        resultType: "complete",
      },
    });
    client.child.stdin.write(`${JSON.stringify(request(2, "tools/list"))}\n`);
    expect(await client.next()).toMatchObject({
      id: 2,
      result: {
        tools: [
          {
            name: "greet",
            inputSchema: {
              type: "object",
              properties: { name: { type: "string" } },
            },
          },
        ],
      },
    });
    const call = Buffer.from(
      `${JSON.stringify(request(3, "tools/call", { name: "greet", arguments: { name: "Ada 🌍" } }))}\n`,
    );
    const split = call.indexOf(Buffer.from("🌍")) + 2;
    client.child.stdin.write(call.subarray(0, split));
    client.child.stdin.write(call.subarray(split));
    expect(await client.next()).toMatchObject({
      id: 3,
      result: {
        resultType: "complete",
        structuredContent: { message: "Hello, Ada 🌍!" },
        content: [{ type: "text", text: '{"message":"Hello, Ada 🌍!"}' }],
      },
    });
    client.child.stdin.end();
    expect(await client.exited).toBe(0);
    expect(client.stderr()).toBe("");
  } finally {
    await client.dispose();
  }
});

it("recovers from malformed input and distinguishes protocol and tool errors", async () => {
  const client = launch();
  try {
    client.child.stdin.write(
      `bad-json\n${JSON.stringify(request(1, "tools/call", { name: "missing" }))}\n${JSON.stringify(request(2, "tools/call", { name: "greet", arguments: { name: "" } }))}\n`,
    );
    expect(await client.next()).toMatchObject({ error: { code: -32700 } });
    expect(await client.next()).toMatchObject({
      id: 1,
      error: { code: -32602 },
    });
    expect(await client.next()).toMatchObject({
      id: 2,
      result: { isError: true },
    });
    client.child.stdin.write(
      `${JSON.stringify(request(3, "tools/call", { name: "greet", arguments: { name: "Ada" } }))}\n`,
    );
    expect(await client.next()).toMatchObject({
      id: 3,
      result: { structuredContent: { message: "Hello, Ada!" } },
    });
    client.child.stdin.end();
    expect(await client.exited).toBe(0);
    expect(client.stderr()).toBe("");
  } finally {
    await client.dispose();
  }
});
