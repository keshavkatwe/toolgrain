# @toolgrain/node

Node-specific transports and IncomingMessage/ServerResponse adapters. The authoring API remains in `@toolgrain/mcp`.

## stdio

```ts
stdio(options?: StdioOptions): Transport
```

| `StdioOptions` field | Default / contract |
| --- | --- |
| `input` | `process.stdin`; Node `Readable` |
| `output` | `process.stdout`; Node `Writable` |
| `maxMessageBytes` | 1 MiB; positive safe integer, excluding newline |

The transport is single-use and newline-delimited UTF-8 JSON. Parse errors permit subsequent frames; oversized frames terminate. Close detaches/pauses input without destroying caller-owned streams. See [stdio behavior](../transports/stdio.md).

## http

```ts
http(options?: HttpTransportOptions): HttpTransport
```

`HttpTransportOptions` extends `HttpOptions` with `port?: number` (default 3000; 0 requests an ephemeral port) and `hostname?: string` (default `127.0.0.1`). Ports must be integers from 0 through 65535. Bind addresses and allowed authorities are independent.

`HttpTransport` extends `RequestTransport`, adds `address(): AddressInfo | undefined`, and owns the listener. The address is copied, available after successful startup, and absent before startup or after close. Managed default allowed hosts are loopback authorities on the actual port. Close stops the listener and active connections; instances cannot restart.

## createNodeHttpHandler

```ts
createNodeHttpHandler(server: Server, options?: HttpOptions)
```

Returns an asynchronous Node handler accepting `IncomingMessage`, `ServerResponse`, and optional middleware `next`. Mount it at the application root before body parsing. It combines MCP and configured auth metadata routes. Unmatched paths delegate untouched when `next` is supplied, otherwise return 404. The application owns the listener and must close it separately.

## createNodeProtectedResourceMetadataHandler

```ts
createNodeProtectedResourceMetadataHandler(
  server: Server,
  options?: Pick<HttpOptions, "allowedHosts">,
)
```

Returns a standalone Node protected-resource metadata handler, useful for routers that explicitly mount the well-known path. Host checks still apply. Applications must make the correct public path reachable.

## HttpOptions

Re-exported from `@toolgrain/http`: `path?`, `allowedHosts?`, `allowedOrigins?`, and `maxMessageBytes?`. See [HTTP reference](http.md) for defaults and validation. Node ignores forwarded headers and preserves the direct scheme, request target, and Host authority. Trusted proxy normalization remains application-owned.
