import {
  AuthError,
  createAuthAccessor,
  createContext,
  createServer,
  type ToolContext,
  type ToolErrorDetails,
  tool,
} from "@toolgrain/mcp";
import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createHttpHandler } from "../src/index.js";

const type = Symbol.for("http-context/auth");
const useAuth = createAuthAccessor<{ userId: string }>(type);
function request(
  revision: SupportedProtocolVersion,
  token = "alice",
  signal?: AbortSignal,
) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": revision,
      "Mcp-Method": "tools/call",
      "Mcp-Name": "read",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "read",
        arguments: {},
        ...(revision === PROTOCOL_VERSION
          ? {
              _meta: {
                "io.modelcontextprotocol/protocolVersion": revision,
                "io.modelcontextprotocol/clientCapabilities": {},
              },
            }
          : {}),
      },
    }),
    ...(signal ? { signal } : {}),
  });
}

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "authenticates before lazy HTTP resolution and isolates concurrent %s requests with the same id",
  async (revision) => {
    const identities: object[] = [];
    const resolve = vi.fn((ctx: ToolContext) => {
      const identity = useAuth(ctx);
      identities.push(identity);
      expect(Object.isFrozen(identity)).toBe(true);
      return { userId: identity.userId };
    });
    const database = createContext({ name: "db", resolve });
    const services = createContext({
      name: "services",
      resolve: (ctx) => database.use(ctx),
    });
    const server = createServer({
      name: "test",
      version: "1",
      auth: {
        type,
        authorizationServers: ["https://auth.example.com"],
        async verify(token) {
          if (token === "invalid") throw new AuthError("invalid_token");
          return { userId: token };
        },
      },
      context: [services, database],
      tools: {
        read: tool({
          input: z.object({}),
          async execute(_input, ctx) {
            const [a, b] = await Promise.all([
              services.use(ctx),
              database.use(ctx),
            ]);
            expect(a).toBe(b);
            return a;
          },
        }),
      },
    });
    const handle = createHttpHandler(server);
    expect((await handle(request(revision, "invalid"))).status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
    const responses = await Promise.all(
      ["alice", "bob"].map((token) => handle(request(revision, token))),
    );
    for (const response of responses) expect(response.status).toBe(200);
    const bodies = await Promise.all(
      responses.map((response) => response.json()),
    );
    expect(bodies.map((body) => body.result.structuredContent)).toEqual([
      { userId: "alice" },
      { userId: "bob" },
    ]);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(identities[0]).not.toBe(identities[1]);
    await server.close();
  },
);

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "keeps authenticated provider failures private and reports isolated %s HTTP request details",
  async (revision) => {
    const failures = {
      alice: new Error("private Alice database detail"),
      bob: new Error("private Bob database detail"),
    };
    const services = createContext({
      name: "services",
      async resolve(ctx) {
        const { userId } = useAuth(ctx);
        throw failures[userId as keyof typeof failures];
      },
    });
    const onError =
      vi.fn<(error: unknown, details?: ToolErrorDetails) => void>();
    const server = createServer({
      name: "test",
      version: "1",
      auth: {
        type,
        authorizationServers: ["https://auth.example.com"],
        async verify(token) {
          return { userId: token };
        },
      },
      context: [services],
      onError,
      tools: {
        read: tool({
          input: z.object({}),
          execute: (_input, ctx) => services.use(ctx),
        }),
      },
    });
    const handle = createHttpHandler(server);
    const responses = await Promise.all(
      ["alice", "bob"].map((token) => handle(request(revision, token))),
    );
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        result: {
          isError: true,
          content: [{ type: "text", text: "Tool execution failed" }],
        },
      });
    }
    expect(onError).toHaveBeenCalledTimes(2);
    for (const error of Object.values(failures)) {
      expect(onError).toHaveBeenCalledWith(error, {
        toolName: "read",
        request: expect.objectContaining({ id: 1, protocolVersion: revision }),
      });
    }
    const details = onError.mock.calls.map(([, detail]) => detail);
    expect(details[0]?.request).not.toBe(details[1]?.request);
    expect(Object.isFrozen(details[0]?.request)).toBe(true);
    for (const token of ["alice", "bob"])
      expect(JSON.stringify(details)).not.toContain(token);
    await server.close();
  },
);
