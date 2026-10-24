# @toolgrain/clerk

Clerk OAuth access-token authorization for Toolgrain MCP servers.

## Installation

Toolgrain packages are unpublished. This command describes consumer
dependencies for a future release; use the
[protected Clerk example](https://github.com/keshavkatwe/toolgrain/tree/main/apps/elysia-example#clerk-authorization-and-inspector)
to try the integration today.

```sh
npm install @toolgrain/clerk @toolgrain/mcp @toolgrain/node zod
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
[authorization guide](https://github.com/keshavkatwe/toolgrain/blob/main/docs/authorization.md)
for Clerk setup, HTTP mounting, resource inference, and host/proxy requirements.

## Requirements

ESM only. Node.js `^24.20.0` or Bun `>=1.4.4 <2`; Zod `^4.6.6` through MCP;
TypeScript 5.5.4 or later with `strict` enabled. The Node example also needs
TypeScript and `@types/node` as development dependencies. See the
[support policy](https://github.com/keshavkatwe/toolgrain/blob/main/docs/support-policy.md).

## License

MIT License, copyright 2026 Keshav Katwe. See the
[license text](https://github.com/keshavkatwe/toolgrain/blob/main/packages/clerk/LICENSE).
Third-party dependencies retain their own licenses.
The [third-party notices](https://github.com/keshavkatwe/toolgrain/blob/main/packages/clerk/NOTICE)
preserve the MIT license and source attributions for `standardwebhooks`, which is
installed through Clerk's backend SDK. Its upstream parent-directory license
and source notices are omitted from the dependency's npm archive.
