import { spawn } from "node:child_process";
import {
  createServer as createHttpServer,
  request as sendHttp,
} from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { expect, it } from "vitest";

it("authenticates both protocol revisions through a compiled Node process", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", kid: "test" };
  let issuer = "";
  const authorizationServer = createHttpServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify(
        request.url === "/keys"
          ? { keys: [jwk] }
          : { issuer, jwks_uri: `${issuer}/keys` },
      ),
    );
  });
  await new Promise<void>((resolve) =>
    authorizationServer.listen(0, "127.0.0.1", resolve),
  );
  issuer = `http://127.0.0.1:${(authorizationServer.address() as AddressInfo).port}`;
  const child = spawn("node", ["dist/index.js"], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, PORT: "0", JWT_ISSUER: issuer, MCP_RESOURCE: "" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  try {
    const endpoint = await new Promise<string>((resolve, reject) => {
      let text = "";
      const timer = setTimeout(
        () => reject(new Error(`Example did not start: ${text}`)),
        10000,
      );
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error(`Example exited: ${text}`));
      });
      child.stderr.on("data", (chunk) => {
        text += chunk.toString();
        const url = /MCP endpoint: (http:\/\/[^\s]+)/.exec(text)?.[1];
        if (url) {
          clearTimeout(timer);
          resolve(url);
        }
      });
    });
    const metadata = new URL(
      "/.well-known/oauth-protected-resource/mcp",
      endpoint,
    );
    expect(await (await fetch(metadata)).json()).toEqual({
      resource: endpoint,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
    });
    const sign = (audience: string) =>
      new SignJWT({ sub: "alice" })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setIssuer(issuer)
        .setAudience(audience)
        .setExpirationTime("5m")
        .sign(privateKey);
    const token = await sign(endpoint);
    for (const revision of ["2026-07-28", "2025-06-18"]) {
      const params = {
        name: "whoAmI",
        arguments: {},
        ...(revision === "2026-07-28"
          ? {
              _meta: {
                "io.modelcontextprotocol/protocolVersion": revision,
                "io.modelcontextprotocol/clientCapabilities": {},
              },
            }
          : {}),
      };
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": revision,
        "Mcp-Method": "tools/call",
        "Mcp-Name": "whoAmI",
      };
      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params,
      });
      const missing = await fetch(endpoint, { method: "POST", headers, body });
      expect(missing.status).toBe(401);
      expect(missing.headers.get("WWW-Authenticate")).toContain(metadata.href);
      const result = await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, Authorization: `Bearer ${token}` },
        body,
      });
      expect(result.status).toBe(200);
      expect(await result.json()).toHaveProperty(
        "result.structuredContent.subject",
        "alice",
      );
      expect(
        (
          await fetch(endpoint, {
            method: "POST",
            headers: {
              ...headers,
              Authorization: `Bearer ${await sign("https://other.example.com")}`,
            },
            body,
          })
        ).status,
      ).toBe(401);
      const invalidHost = await new Promise<number | undefined>(
        (resolve, reject) => {
          const req = sendHttp(
            endpoint,
            {
              method: "POST",
              headers: { ...headers, Host: "evil.example.com" },
            },
            (res) => {
              res.resume();
              resolve(res.statusCode);
            },
          );
          req.on("error", reject);
          req.end(body);
        },
      );
      expect(invalidHost).toBe(400);
    }
  } finally {
    child.kill("SIGTERM");
    await exited;
    authorizationServer.closeAllConnections();
    await new Promise<void>((resolve) =>
      authorizationServer.close(() => resolve()),
    );
  }
}, 20000);
