# @toolgrain/react

Native React 19 widgets for MCP Apps hosts. Toolgrain implements the iframe
protocol directly; no official MCP or Apps SDK is used by this package.

Available in Toolgrain 0.3.0 or later. Install matching stable versions across
Toolgrain packages; these commands resolve npm's `latest` tag:

```sh
npm install @toolgrain/react @toolgrain/mcp @toolgrain/protocol react@^19.3.1 react-dom@^19.3.1 zod@^4.6.6
```

Use the same version for HTTP/Node adapters and any JWT/Clerk integrations.
The [repository example](https://github.com/keshavkatwe/toolgrain/tree/main/apps/react-apps-example)
demonstrates weather and sales widgets with separate and shared HTML entries.

Import your server's registered tool map with
`import type`, then call `createApp<typeof tools>()` to obtain `AppProvider`,
`useToolResult`, `useToolCall`, `useHostContext`, and `useHostActions`. The factory is safe to import
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

Resource content `_meta.ui` also carries CSP origins, requested permissions,
sandbox `domain`, and `prefersBorder`. Set `prefersBorder: true` to request a
host-provided border/background, `false` to request neither, or omit it to let
the host choose. Put `resourceUri` and `visibility` on the tool; `visibility:
["app"]` enables host-enforced app-only refresh/filter tools and does not replace
endpoint authorization.

`useHostActions()` exposes
`available`, `openLink(url, options?)`, `sendMessage(params, options?)`,
`updateModelContext(params, options?)`, and `requestDisplayMode(mode, options?)`.
Requests require advertised host support, including each message/context content kind. The provider accepts
`availableDisplayModes` (default `["inline"]`); mode requests require the
host/provider intersection and return the actual selected mode. Live host context
continues to follow notifications. Actions use the same signal/deadline options,
preserve full replies, and resolve explicit `isError` denials. The caller owns
pending/error state. Use explicit interaction handlers; sending a user message
can trigger a follow-up, while replacement context applies to future turns.
See the [host actions guide](https://toolgrain.mintlify.site/mcp-apps/host-actions).

Partial tool arguments are ignored. File downloads, resource reads, and sampling
remain outside the public React API. See the
[protocol support table](https://toolgrain.mintlify.site/mcp-apps/capabilities#react-protocol-support).

See the [MCP Apps guide](https://toolgrain.mintlify.site/mcp-apps/overview).
Host compatibility must be verified per version and transport; no live-host
acceptance is implied by the protocol test suite.

Run `bun run test:interop` from the repository root for the isolated official-SDK
widget compatibility check. SDK dependencies are installed only in a disposable
temporary consumer, never in this package or its published dependency graph.
