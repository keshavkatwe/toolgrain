# Express example

This is an independent application with its own dependencies and native development workflow.

From the repository root, install dependencies and build Toolgrain first:

```sh
bun install --frozen-lockfile
bun run build
cd apps/express-example
bun run dev
```

The development endpoint is `http://127.0.0.1:3001/mcp`.
For a production-style run inside this directory:

```sh
bun run build
bun run start
```

The start command defaults to port 3001; set `PORT` to override it.

| Script | Native command |
| --- | --- |
| `dev` | `tsx watch src/index.ts` |
| `build` | `tsc -p tsconfig.build.json` |
| `start` | `node dist/index.js` |

`src/app.ts` mounts `createNodeHttpHandler()` before `express.json()`. `src/index.ts` runs Express and handles shutdown; The tool and MCP server definitions are inline in `src/app.ts`. Express has no separate server CLI; development uses the normal TypeScript `tsx` watcher.

The app imports Toolgrain's compiled workspace packages. Root `bun run dev` watches
those packages and runs every example's own development command; HTTP development
ports are distinct. Running only this app's `dev` command does not rebuild Toolgrain.

## Testing

```sh
bun run build
bun run test
```

The smoke test starts this app's actual `start` command on an available loopback
port, checks discovery, tool listing and greet execution, and stops the process.
There is no code coverage instrumentation or coverage floor for example apps.
Root `bun run test:examples` builds and tests all examples. CI runs that separately
from library coverage and retains each workspace's test report.

The MCP revision is `2026-07-28`, with JSON responses. Clients must send the
protocol metadata and mirrored headers. A present browser Origin requires an
explicit `allowedOrigins` setting; configure CORS and authentication in the app.
SSE remains separate work. Optional JWT/Clerk authorization and automatic public
metadata are described in [authorization](https://toolgrain.mintlify.site/guides/authorization). Toolgrain
packages are private workspace packages, so this example currently runs from this
repository.

## MCP Inspector

Start this app with `bun run dev`, then open another terminal in this directory:

```sh
bun run inspect
```

This launches Inspector 2.11.0 in modern protocol mode against this app's development
endpoint. Connect, list tools, and call `greet` with `{ "name": "Ada" }`.
The Inspector script connects to an already running app; it does not start it.

For a different port or production URL, override the endpoint:

```sh
bun run inspect http://127.0.0.1:4000/mcp
```

## Composing application routes

The combined Node handler calls Express `next()` for unrelated paths before
reading the body. Register it before `express.json()`, then register REST routes
normally. MCP and public metadata requests finish inside Toolgrain, including MCP
404 protocol errors. The routing regression checks health and JSON echo routes,
public metadata, authentication, and host rejection on a real Express listener.
