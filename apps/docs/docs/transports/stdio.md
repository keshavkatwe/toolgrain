# Stdio transport

Use `stdio()` from `@toolgrain/node` when a client launches your server as a local process. The adapter handles framing and lifecycle; MCP method handling stays in `@toolgrain/mcp`.

```ts
import { stdio } from "@toolgrain/node";
await server.listen(stdio({ maxMessageBytes: 1024 * 1024 }));
```

## Framing and limits

Messages are newline-delimited UTF-8 JSON. The default incoming-message limit is 1 MiB, excluding the newline. Malformed JSON or UTF-8 reports a parse error and permits later messages. Oversized frames terminate the transport. Outgoing writes respect writable backpressure and preserve ordering.

`input` and `output` may be supplied as Node streams; they default to `process.stdin` and `process.stdout`. A transport instance is single-use. A server accepts one transport, and close is terminal.

## Shutdown

EOF is the normal stdio shutdown signal. Closing detaches listeners and pauses input without destroying or ending supplied streams or calling `process.exit()`. Active request signals abort on connection close. A handler that ignores its signal may continue running, but its response is discarded.

Auth-configured servers reject message transports before startup. Use HTTP when configuring endpoint authorization.

## Operational guidance

Keep all logs off stdout. Use absolute compiled entry-point paths in client configuration. Reconnect after rebuilding so the client launches a fresh process. Separate build output from protocol stdout. See [client setup](../getting-started/clients.md) and the [Node API](../reference/node.md).
