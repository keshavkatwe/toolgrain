# @toolgrain/react

Native React 19 widgets for MCP Apps hosts. Toolgrain implements the iframe
protocol directly; no official MCP or Apps SDK is used by this package.

This package is unreleased. Use the repository's React Apps example until the
reviewed release is available on npm.

```sh
npm install @toolgrain/react @toolgrain/mcp react react-dom zod
```

Use matching Toolgrain versions. Import your server's registered tool map with
`import type`, then call `createApp<typeof tools>()` to obtain `AppProvider`,
`useToolResult`, `useToolCall`, and `useHostContext`. The factory is safe to import
on the server; mounting the provider connects the browser widget to its host.

Provide `appInfo={{ name, version }}` and either `tool="registered_name"` or
`resolveTool(result, hostContext)`. Shared entries must explicitly select a tool
from application-owned result metadata; the host's optional tool name is only a
hint. Routing settings are fixed until the provider remounts.

`useToolResult(name?)` retains the initiating input/result and cancellation state.
`useToolCall(name)` tracks interactive calls separately. Its `call(input, options?)`
returns the full result, including explicit `isError` tool failures. JSON-RPC and
connection failures reject. Only the latest invocation updates the hook state.
`options` accepts `signal` and `timeoutMs` (30 seconds by default).

Results preserve `content`, optional `structuredContent`, and optional `_meta`.
Wire envelopes are validated; application payload types are inferred, not
validated in the browser. Use object-root structured output for compatibility
with both supported outer MCP revisions. Toolgrain also serializes structured
output into assistant-facing text; put additional widget data in result `_meta`.

Host styles/fonts and automatic size reporting are enabled by default. Disable
them with `applyHostStyles={false}` and `autoResize={false}`. The host owns iframe
sandboxing, permissions, and CSP enforcement. Apps require an embedding host;
opening the HTML directly does not simulate a connection.

Bundle your application into HTML and serve it with `resource()` at a `ui://`
URI using `text/html;profile=mcp-app`. Point the tool's `_meta.ui.resourceUri` to
that URI. This package supplies neither a bundler nor a host renderer.

See the [MCP Apps guide](https://toolgrain.mintlify.site/mcp-apps/overview).
Host compatibility must be verified per version and transport; no live-host
acceptance is implied by the protocol test suite.

Run `bun run test:interop` from the repository root for the isolated official-SDK
widget compatibility check. SDK dependencies are installed only in a disposable
temporary consumer, never in this package or its published dependency graph.
