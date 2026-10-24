# Run a server in production

Toolgrain owns the MCP boundary. Your application owns deployment, application permissions, resource lifecycle, and the infrastructure around the listener. Start with a real client call and a cancellation/disconnect check in your target environment.

## Public URLs and trusted proxies

Configure exact `allowedHosts` authorities. Binding an HTTP listener to `0.0.0.0` does not authorize arbitrary Host values. If a proxy terminates TLS or changes request URLs, normalize the public URL through middleware that trusts only your known proxy. Node adapters preserve the direct scheme and request target and ignore forwarded headers.

Audience checks and protected-resource metadata must use the public resource URL, including the MCP endpoint path and excluding queries. An explicit provider `resource` can override inference; it does not replace host validation. Make metadata GET/HEAD routes reachable through the same public infrastructure.

## Authorization and application permissions

Use endpoint authorization for tools that require authenticated callers. Grant the application service only the permissions its tools need. Enforce action-specific user/scope policies in application code; successful token verification does not automatically permit every tool action. Keep secret keys server-side and accept credentials through Bearer headers, not query strings.

Client capability/info fields and arbitrary request metadata are self-reported. Treat them as untrusted even though Toolgrain freezes their copies.

## CORS and request limits

`allowedOrigins` checks a supplied Origin. It does not implement CORS responses or preflight handling. Configure browser access in your framework if required. Put the MCP handler before body parsing. Keep the incoming message limit appropriate for your tools; adapters default to 1 MiB. Application listeners/proxies own connection limits, rate limiting, TLS, and additional infrastructure timeouts.

## Deadlines and cancellation

Pass `ctx.signal` to application operations and set explicit operation deadlines where needed. A client timeout may not promptly cancel server work. A handler/provider that ignores a signal can keep running after the response has been discarded. Do not assume a raced promise or a closed connection has stopped a database query.

## Shutdown and resource ownership

For the managed Node transport, `server.close()` stops its listener. For framework adapters, close the framework listener and Toolgrain server. Close application-owned pools and clients yourself after coordinating outstanding work. Context providers do not automatically dispose values or open transactions.

Close is terminal, idempotent, and re-entrant. Do not try to restart an attached transport; construct a fresh server/transport for a new lifecycle.

## Diagnostics and deployment checks

Keep protocol stdout clean on stdio. Record unexpected errors with `onError`, keeping raw failures in private diagnostics. Review logging of client metadata and application data. Verify discovery, listing, a successful call, invalid input, auth rejection, metadata discovery, disconnects, and shutdown on your actual runtime.

Use the [support policy](../project/support-policy.md) and [interoperability report](../compatibility/clients.md) to distinguish a supported target from a verified combination. Toolgrain's current HTTP implementation does not supply sessions, SSE, resumability, or subscriptions.
