# Protect HTTP endpoints

Configure authorization on `createServer({ auth })`. Verification happens before body parsing, tool execution, and lazy provider resolution. Tools remain reusable and `ToolContext` stays non-generic.

Choose [JWT](jwt.md) for trusted OAuth JWT access tokens, [Clerk](clerk.md) for Clerk OAuth access tokens, or implement the [provider contract](../reference/auth.md) for another verifier.

## Authentication is not tool policy

The provider verifies a token and exposes a frozen request identity. Your application still decides which user may perform each action. Tool annotations and self-reported client metadata are not authorization checks. Per-tool scope-policy configuration is not part of the current API.

Read the verified identity inside a tool or provider:

```ts
import { useAuth } from "@toolgrain/clerk";
// Inside execute(input, ctx):
const { userId, scopes } = useAuth(ctx);
```

The integration's accessor is synchronous and provider-specific. It rejects contexts without the matching identity. Raw tokens and Clerk SDK methods are not exposed.

## Resource and metadata

The resource is the endpoint's public URL, excluding queries and preserving its path. HTTP adapters infer it from validated request URLs unless the provider supplies an explicit resource. Audience checks, metadata, and Bearer challenges use the same value.

Combined handlers automatically route public GET/HEAD protected-resource metadata. Mount them at the root; for filesystem routers, add the explicit metadata route. Bearer headers are the only credential source; query tokens are rejected.

## Client login

Use an OAuth authorization server to issue access tokens for the endpoint resource. Configure a public client and its redirect URI in that provider, then use the MCP client's supported login flow. The Clerk Elysia example documents an Inspector PKCE setup. Live OAuth login remains a separate verification gap in the client report; synthetic bearer checks do not establish an end-to-end login pass.

Toolgrain does not implement token issuance, login, consent, client registration, or token storage. Auth-configured servers require request transports such as HTTP and reject stdio. See the [complete authorization guide](../guides/authorization.md) for routing, custom providers, HTTP status behavior, and direct-call scopes.
