# @toolgrain/jwt

Private Toolgrain JWT access-token verification integration.

```ts
import { jwt, useAuth } from "@toolgrain/jwt";

const auth = jwt({ issuer: "https://auth.example.com" });
// Pass auth to createServer({ name, version, tools, auth }).
// Inside a tool: const { claims } = useAuth(ctx).
```

Discover signing keys from a trusted issuer; optional `jwksUrl`, `resource`, and
`algorithms` override the defaults. Resource inference uses the validated public
HTTP request URL. Standard claims are typed; custom claims remain unknown.
Requires a signed access token with matching issuer/audience and valid expiration.
This integration verifies tokens and does not implement an OAuth server.

See the repository's [authorization guide](../../docs/authorization.md) for HTTP
mounting, metadata, host/proxy requirements, and a complete example.
