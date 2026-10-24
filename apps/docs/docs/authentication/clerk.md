# Clerk OAuth access tokens

`clerk()` accepts Clerk OAuth JWT and opaque access tokens. Session tokens, API keys, and M2M tokens are intentionally excluded. Both the publishable key and secret key are required.

```ts
import { clerk, useAuth } from "@toolgrain/clerk";
import { createServer, tool } from "@toolgrain/mcp";
import { http } from "@toolgrain/node";
import { z } from "zod";

const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const secretKey = process.env.CLERK_SECRET_KEY;
if (!publishableKey || !secretKey) throw new Error("Clerk keys are required");

const whoAmI = tool({
  input: z.object({}),
  execute(_input, ctx) {
    const { userId, clientId, scopes } = useAuth(ctx);
    return { userId, clientId, scopes: [...scopes] };
  },
});
const server = createServer({
  name: "clerk-example", version: "1.0.0", tools: { whoAmI },
  auth: clerk({ publishableKey, secretKey }),
});
await server.listen(http({ port: 3000 }));
```

Keep secret keys in server-side configuration. The provider derives its issuer from the publishable key. The frozen accessor result exposes `userId`, `clientId`, and readonly `scopes`, not the token or SDK client.

## Configure a client

Configure a Clerk OAuth application, a public client with the appropriate redirect URI, and tokens intended for your MCP resource URL. The protected Elysia example includes manual Inspector PKCE instructions in its README.

The repository's ordinary Elysia flow is credential-free on port 3003. Its separate `dev:clerk` flow uses port 3007 and reads keys from the workspace's ignored `.env.local`. Missing keys fail startup. Do not treat an unprotected example as an auth smoke test.

Token verification is covered by offline JWT/opaque-token responses. Live OAuth login and consent require your local keys and provider configuration and are not claimed as fully verified client flows. See [the full guide](../guides/authorization.md#clerk) and [Clerk reference](../reference/clerk.md).
