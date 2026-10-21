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

See the repository's [authorization guide](../../docs/authorization.md) for Clerk
setup, HTTP mounting, resource inference, and host/proxy requirements.
