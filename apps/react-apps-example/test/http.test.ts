import { type ChildProcess, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";

let child: ChildProcess;
let endpoint: string;
beforeAll(async () => {
  child = spawn("bun", ["run", "start"], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  endpoint = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error(`Startup timed out: ${output}`)),
      15000,
    );
    const fail = (error: unknown) => {
      clearTimeout(timer);
      reject(error);
    };
    child.once("error", fail);
    child.once("exit", () => fail(new Error(`Example exited: ${output}`)));
    child.stderr?.on("data", (chunk) => {
      output += String(chunk);
      const address = /React Apps example: (http:\/\/[^\s]+)/.exec(output)?.[1];
      if (address) {
        clearTimeout(timer);
        resolve(new URL("/mcp", address).href);
      }
    });
  });
});
afterAll(async () => {
  if (child?.exitCode === null)
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
    });
});

it.each(["2026-07-28", "2025-06-18"])(
  "serves React resources, links, metadata and fallbacks over %s",
  async (revision) => {
    const request = async (
      method: string,
      params: Record<string, unknown> = {},
    ) => {
      const modern = revision === "2026-07-28";
      const name = method === "resources/read" ? params.uri : params.name;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": revision,
          ...(modern
            ? {
                "Mcp-Method": method,
                ...(typeof name === "string" ? { "Mcp-Name": name } : {}),
              }
            : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params: {
            ...params,
            ...(modern
              ? {
                  _meta: {
                    "io.modelcontextprotocol/protocolVersion": revision,
                    "io.modelcontextprotocol/clientCapabilities": {},
                  },
                }
              : {}),
          },
        }),
      });
      expect(response.status).toBe(200);
      return (await response.json()).result;
    };
    const listed = await request("tools/list");
    expect(listed.tools).toHaveLength(4);
    expect(
      listed.tools.find(
        (tool: { name: string }) => tool.name === "shared_weather",
      )._meta.ui.resourceUri,
    ).toBe("ui://demo/shared.html");
    const resources = await request("resources/list");
    expect(resources.resources).toHaveLength(3);
    for (const resource of resources.resources) {
      expect(resource.mimeType).toBe("text/html;profile=mcp-app");
      const read = await request("resources/read", { uri: resource.uri });
      expect(read.contents[0].text).toContain("<!doctype html>");
      expect(read.contents[0].text).toContain("ui/initialize");
      expect(read.contents[0]._meta.ui.csp.connectDomains).toEqual([]);
      expect(read.contents[0].mimeType).toBe(resource.mimeType);
    }
    const result = await request("tools/call", {
      name: "shared_sales",
      arguments: { region: "West" },
    });
    expect(result.structuredContent).toEqual({ region: "West", total: 31000 });
    expect(result._meta).toMatchObject({
      view: "sales",
      points: [10, 20, 15, 30],
    });
    expect(
      result.content.some((block: { text: string }) =>
        block.text.includes("31000"),
      ),
    ).toBe(true);
  },
);

it("bundles no server implementation, Node builtins, or official SDK", async () => {
  for (const entry of ["weather", "sales", "shared"]) {
    const modules: string[] = JSON.parse(
      await readFile(
        new URL(`../dist/widgets/${entry}-modules.json`, import.meta.url),
        "utf8",
      ),
    );
    expect(
      modules.some((id) =>
        /\/src\/(tools|server)\.ts$|@modelcontextprotocol|\bnode:/.test(id),
      ),
    ).toBe(false);
    expect(
      modules.some(
        (id) => id.includes("toolgrain/react") || id.includes("packages/react"),
      ),
    ).toBe(true);
  }
});
