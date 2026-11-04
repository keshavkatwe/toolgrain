import {
  CLERK_OAUTH_SCOPES,
  type ClerkBuiltInOAuthScope,
  type ClerkOAuthScope,
  clerk,
  useAuth,
} from "@toolgrain/clerk";
import { createServer, tool } from "@toolgrain/mcp";
import { z } from "zod";

const who = tool({
  input: z.object({}),
  execute(_input, ctx) {
    const auth = useAuth(ctx);
    const userId: string = auth.userId;
    const scopes: readonly string[] = auth.scopes;
    return { userId, scopes };
  },
});
const server = createServer({
  name: "clerk",
  version: "1",
  tools: { who },
  auth: clerk({
    publishableKey: "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk",
    secretKey: "sk_test_example",
    scopesSupported: [
      "openid",
      "profile",
      "posts:read",
    ] satisfies readonly ClerkOAuthScope[],
  }),
});
await server.close();

const builtIn: ClerkBuiltInOAuthScope = "user:org:read";
const builtIns: readonly ClerkBuiltInOAuthScope[] = CLERK_OAUTH_SCOPES;
const custom: ClerkOAuthScope = "posts:read";
// @ts-expect-error A custom scope is not a built-in Clerk scope.
const invalidBuiltIn: ClerkBuiltInOAuthScope = "posts:read";
void [builtIn, builtIns, custom, invalidBuiltIn];
