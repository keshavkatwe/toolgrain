<a href="https://github.com/keshavkatwe/toolgrain#readme">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/keshavkatwe/toolgrain/main/brand/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/keshavkatwe/toolgrain/main/brand/logo-light.svg">
    <img src="https://raw.githubusercontent.com/keshavkatwe/toolgrain/main/brand/logo-light.svg" alt="Toolgrain" width="200" height="48">
  </picture>
</a>

# @toolgrain/clerk

**Bring Clerk OAuth to your MCP server.**

Verify Clerk OAuth access tokens before tool execution, then access the verified
user, client, and scopes inside your handlers.

[Documentation](https://toolgrain.mintlify.site/authentication/clerk) ·
[Examples](https://toolgrain.mintlify.site/examples) ·
[npm](https://www.npmjs.com/package/@toolgrain/clerk)

## Installation

Install matching stable versions across Toolgrain libraries. These commands
resolve npm's `latest` tag.

```sh
npm install @toolgrain/clerk @toolgrain/mcp @toolgrain/node zod@^4.6.6
```

## Protect an HTTP server

```ts
import { clerk, useAuth } from "@toolgrain/clerk";
import { createServer, tool } from "@toolgrain/mcp";
import { http } from "@toolgrain/node";
import { z } from "zod";

const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const secretKey = process.env.CLERK_SECRET_KEY;
if (!publishableKey || !secretKey) {
  throw new Error("Set CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY");
}

const server = createServer({
  name: "clerk-server",
  version: "1.0.0",
  auth: clerk({ publishableKey, secretKey }),
  tools: {
    whoAmI: tool({
      input: z.object({}),
      execute(_input, ctx) {
        const { userId, clientId, scopes } = useAuth(ctx);
        return { userId, clientId, scopes };
      },
    }),
  },
});

await server.listen(http({ port: 3000 }));
```

Load both keys through your application's environment configuration. Clients
obtain Clerk OAuth access tokens and send them in the Bearer authorization
header. Verification runs before body parsing and tool work. Configure
application shutdown to call `server.close()`.

Derives the issuer from the publishable key. Supports JWT and opaque OAuth access
tokens for the resolved resource; session tokens, API keys, and M2M tokens are
rejected. `resource` is an optional canonical URL override. Identities are plain,
readonly data, without credentials or SDK methods.

Enable `aud_claim_enabled` in your Clerk instance's OAuth application settings
before authorizing clients. Tokens must include the resolved MCP resource in
`aud`; tokens issued without an audience are rejected with `invalid_token`.
Authorize again after changing the setting to obtain a new access token.
Audience errors include a public description distinguishing missing `aud` from a
mismatch and identifying the expected resource. JWTs and opaque tokens use the
same validation; raw tokens, received audiences, and provider causes stay private.

Configure exact production `allowedHosts` on the HTTP adapter and normalize
proxy URLs through trusted application middleware. See the
[authorization guide](https://toolgrain.mintlify.site/guides/authorization)
for Clerk setup, HTTP mounting, resource inference, and host/proxy requirements.

## Requirements

ESM only. Node.js `^24.20.0` or Bun `>=1.4.4 <2`; Zod `^4.6.6` through MCP;
TypeScript 5.5.4 or later with `strict` enabled. The Node example also needs
TypeScript and `@types/node` as development dependencies. See the
[support policy](https://toolgrain.mintlify.site/project/support-policy).

## License

MIT License, copyright 2026 Keshav Katwe. See the
[license text](https://github.com/keshavkatwe/toolgrain/blob/main/packages/clerk/LICENSE).
Third-party dependencies retain their own licenses.
The [third-party notices](https://github.com/keshavkatwe/toolgrain/blob/main/packages/clerk/NOTICE)
preserve the MIT license and source attributions for `standardwebhooks`, which is
installed through Clerk's backend SDK. Its upstream parent-directory license
and source notices are omitted from the dependency's npm archive.
