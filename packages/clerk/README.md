# @toolgrain/clerk

Private Toolgrain integration for Clerk OAuth access tokens.

```ts
import { clerk, useAuth } from "@toolgrain/clerk";

const auth = clerk({
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY!,
  secretKey: process.env.CLERK_SECRET_KEY!,
});
// Pass auth to createServer({ name, version, tools, auth }).
// Inside a tool: const { userId, clientId, scopes } = useAuth(ctx).
```

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

See the repository's [authorization guide](../../docs/authorization.md) for Clerk
setup, HTTP mounting, resource inference, and host/proxy requirements.
