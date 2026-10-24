# Shared authorization API

All exports on this page come from `@toolgrain/mcp`. JWT and Clerk implement this provider contract and supply their own identity types/accessors.

## AuthProvider

```ts
interface AuthProvider<Identity extends object = object> {
  readonly type: symbol;
  readonly resource?: string;
  readonly authorizationServers: readonly string[];
  verify(accessToken: string, options: AuthVerifyOptions): Promise<Identity>;
}
interface AuthVerifyOptions {
  readonly signal: AbortSignal;
  readonly resource: string;
}
```

`type` identifies the provider/accessor pairing. Use a stable registered symbol when compatible package copies must interoperate. `verify()` must honor cancellation where possible and return structured-cloneable plain identity data. Toolgrain copies/freezes the verified identity per request. Custom providers own cryptographic verification and their application-specific checks.

`AuthMetadata` contains optional `resource` and readonly `authorizationServers`; `server.getAuthMetadata()` returns it when configured. `AuthReadonly<T>` recursively describes the frozen identity view, including arrays.

## createAuthAccessor

```ts
createAuthAccessor<Identity extends object>(type: symbol)
  // returns (ctx: ToolContext) => AuthReadonly<Identity>
```

The accessor is synchronous and rejects contexts without a matching verified identity. Register a provider with the same symbol. It does not verify a token on access. A direct `toolContext()` has no HTTP auth identity.

## AuthError and isAuthError

```ts
new AuthError(code: AuthErrorCode, options?: ErrorOptions & { description?: string })
isAuthError(value: unknown): value is AuthError
```

`AuthErrorCode` is `"invalid_request" | "invalid_token" | "access_denied" | "temporarily_unavailable"`. The error exposes `code` and optional public `description`; `cause` stays private. Only put safe, intentional client guidance in `description`. `isAuthError()` recognizes compatible branded errors.

| Code | HTTP status |
| --- | --- |
| `invalid_request` | 400 |
| `invalid_token` | 401 |
| `access_denied` | 403 |
| `temporarily_unavailable` | 503 |

Unexpected auth failures, including provider outages, reach `onError` once without tool/request details; expected rejections and cancelled late failures do not. Do not convert every trusted-key or upstream failure into `invalid_token`.

## AuthScope

`server.authorize(token, { resource, signal? })` returns a server-bound, single-use `AuthScope`. It exposes readonly `signal` and `dispose(): void`. Pass the scope to `server.handle(message, { auth: scope })` exactly once and always dispose it in `finally`. Scope verification/body reading/tool work observe cancellation and server close.

## Validation helpers

`validateAuthUrl(value: string): string` validates authorization/resource URLs, requiring HTTPS except permitted loopback HTTP. `validateTokenAudience(audience: unknown, resource: string): void` checks a verified token's audience, accepts a string or all-string array, and throws `AuthError("invalid_token")` for missing/mismatched audiences with safe public guidance. Call it **after** token verification; it does not authenticate arbitrary claims.

For complete provider examples and HTTP integration, see [authorization](../guides/authorization.md#custom-providers-and-direct-invocation).
