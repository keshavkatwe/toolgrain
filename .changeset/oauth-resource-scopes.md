---
"@toolgrain/mcp": minor
"@toolgrain/http": minor
"@toolgrain/jwt": minor
"@toolgrain/clerk": minor
---

Declare resource OAuth scopes with `scopesSupported` on auth providers, including direct Clerk and JWT configuration. Validate and copy scope catalogs and emit them as `scopes_supported` in protected-resource discovery without imposing a required-scope policy.

Add `AuthError("insufficient_scope", { requiredScopes, description })` for verified-token scope denials. HTTP adapters return a 403 Bearer challenge with optional required scopes and explicit public guidance, preserving private causes and existing authentication behavior.
