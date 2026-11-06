# React MCP Apps example

One React project demonstrates weather/sales widgets with separate HTML entries
and a shared entry. Data is deterministic demo data. No external API or credentials
are needed. Browser code imports the server tool map using `import type`.

From the repository root:

```sh
bun install --frozen-lockfile
bun run build --filter=@toolgrain/react-apps-example
bun run --cwd apps/react-apps-example start
```

Use Bun 1.4.4 or later for the application. The HTTP endpoint is
`http://localhost:3008/mcp`. The default security configuration accepts localhost
and 127.0.0.1; exposing it elsewhere requires explicit host configuration.
Use `start:stdio` for a local MCP host supporting stdio.

Call `weather` or `sales` for individual entries; `shared_weather` and
`shared_sales` both reference the shared HTML resource. Shared routing uses the
result's application-owned `_meta.view`. Buttons call back through the host.

The pinned Vite/single-file build belongs to this application. `dev:ui` watches
the shared entry; `dev` watches the Bun server. Rebuild other entries when editing
them. Opening the HTML directly does not provide an Apps host.

Host acceptance is version/transport-specific. Claude Desktop live rendering has
not yet been verified for this example; see the MCP Apps documentation for the
acceptance procedure and recorded results.
