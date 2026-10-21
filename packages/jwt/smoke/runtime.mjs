import assert from "node:assert/strict";
import { jwt, useAuth } from "@toolgrain/jwt";
import { createServer, toolContext } from "@toolgrain/mcp";

const server = createServer({
  name: "jwt",
  version: "1",
  tools: {},
  auth: jwt({ issuer: "https://auth.example.com" }),
});
assert.deepEqual(server.getAuthMetadata(), {
  authorizationServers: ["https://auth.example.com"],
});
assert.throws(() => useAuth(toolContext()), /no identity/);
await assert.rejects(server.handle({}), /Invalid access token/);
await server.close();
