import { AuthError, createServer, tool } from "@toolgrain/mcp";
import { LEGACY_PROTOCOL_VERSION, PROTOCOL_VERSION } from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createHttpHandler,
  createProtectedResourceMetadataHandler,
} from "../src/index.js";

const resource = "https://api.example.com/mcp";
const metadataUrl =
  "https://api.example.com/.well-known/oauth-protected-resource/mcp";
const scopesSupported = [
  "openid",
  "profile",
  "email",
  "offline_access",
] as const;

it.each([undefined, [], scopesSupported])(
  "advertises configured resource scopes exactly: %j",
  async (scopes) => {
    const verify = vi.fn(async () => ({ scopes: [] }));
    const server = createServer({
      name: "resource-scopes",
      version: "1",
      tools: {},
      auth: {
        type: Symbol.for("test/resource-scopes"),
        authorizationServers: ["https://auth.example.com"],
        ...(scopes === undefined ? {} : { scopesSupported: scopes }),
        resource,
        verify,
      },
    });
    try {
      const options = { allowedHosts: ["api.example.com"] };
      for (const handle of [
        createHttpHandler(server, options),
        createProtectedResourceMetadataHandler(server, options),
      ]) {
        const response = await handle(new Request(metadataUrl));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          resource,
          authorization_servers: ["https://auth.example.com"],
          bearer_methods_supported: ["header"],
          ...(scopes === undefined ? {} : { scopes_supported: scopes }),
        });
        const head = await handle(new Request(metadataUrl, { method: "HEAD" }));
        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
        expect(head.headers.get("Cache-Control")).toBe("no-store");
        expect(
          (await handle(new Request(metadataUrl.replace("api.", "evil."))))
            .status,
        ).toBe(403);
      }
      // Supported scopes describe discovery; they do not become required scopes.
      const scope = await server.authorize("valid", { resource });
      scope.dispose();
      expect(verify).toHaveBeenCalledOnce();
    } finally {
      await server.close();
    }
  },
);

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION])(
  "challenges a genuine scope denial before body parsing in %s",
  async (revision) => {
    const execute = vi.fn(() => "ok");
    const onError = vi.fn();
    const requiredScopes = ["tools:write", "profile"];
    const failure = new AuthError("insufficient_scope", {
      requiredScopes,
      description: "Reauthorize with the required scopes.",
      cause: new Error("private token and provider data"),
    });
    requiredScopes.push("changed");
    const server = createServer({
      name: "scope-denial",
      version: "1",
      onError,
      auth: {
        type: Symbol.for("test/scope-denial"),
        authorizationServers: ["https://auth.example.com"],
        async verify(token) {
          const identity = { scopes: token === "full" ? ["tools:write"] : [] };
          if (!identity.scopes.includes("tools:write")) throw failure;
          return identity;
        },
      },
      tools: { write: tool({ input: z.object({}), execute }) },
    });
    try {
      const handle = createHttpHandler(server, {
        allowedHosts: ["api.example.com"],
      });
      const request = new Request(resource, {
        method: "POST",
        headers: {
          Authorization: "Bearer limited",
          "MCP-Protocol-Version": revision,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: "{",
      });
      const response = await handle(request);
      expect(response.status).toBe(403);
      expect(response.headers.get("WWW-Authenticate")).toBe(
        `Bearer resource_metadata="${metadataUrl}", error="insufficient_scope", error_description="Reauthorize with the required scopes.", scope="tools:write profile"`,
      );
      expect(await response.json()).toEqual({
        error: "insufficient_scope",
        error_description: "Reauthorize with the required scopes.",
      });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(execute).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      const scope = await server.authorize("full", { resource });
      scope.dispose();
    } finally {
      await server.close();
    }
  },
);

it.each([undefined, []])(
  "supports scope denials without required scope details: %j",
  async (requiredScopes) => {
    const server = createServer({
      name: "scope-denial",
      version: "1",
      tools: {},
      auth: {
        type: Symbol.for("test/scope-denial"),
        authorizationServers: ["https://auth.example.com"],
        async verify() {
          throw new AuthError("insufficient_scope", {
            cause: new Error("private"),
            ...(requiredScopes === undefined ? {} : { requiredScopes }),
          });
        },
      },
    });
    try {
      const response = await createHttpHandler(server, {
        allowedHosts: ["api.example.com"],
      })(
        new Request(resource, {
          method: "POST",
          headers: {
            Authorization: "Bearer valid",
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
        }),
      );
      expect(response.status).toBe(403);
      expect(response.headers.get("WWW-Authenticate")).toBe(
        `Bearer resource_metadata="${metadataUrl}", error="insufficient_scope"`,
      );
      expect(await response.json()).toEqual({ error: "insufficient_scope" });
    } finally {
      await server.close();
    }
  },
);
