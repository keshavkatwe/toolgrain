import {
  AuthError,
  createAuthAccessor,
  createContext,
  createServer,
  type ToolContext,
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
