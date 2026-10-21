import assert from "node:assert/strict";
import { clerk, useAuth } from "@toolgrain/clerk";
import { createServer, toolContext } from "@toolgrain/mcp";

const server = createServer({
  name: "clerk",
  version: "1",
  tools: {},
  auth: clerk({
    publishableKey: "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk",
    secretKey: "sk_test_example",
  }),
});
assert.deepEqual(server.getAuthMetadata(), {
  authorizationServers: ["https://example.clerk.accounts.dev"],
});
assert.throws(() => useAuth(toolContext()), /no identity/);
await assert.rejects(server.handle({}), /Invalid access token/);
await server.close();
