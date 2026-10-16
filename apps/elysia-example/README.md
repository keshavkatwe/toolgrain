# Elysia on Bun example

This is an independent application with its own dependencies and native development workflow.

From the repository root, install dependencies and build Toolgrain first:

```sh
bun install --frozen-lockfile
bun run build
cd apps/elysia-example
bun run dev
```

The development endpoint is `http://127.0.0.1:3003/mcp`.
For a production-style run inside this directory:

```sh
bun run build
bun run start
```

The start command defaults to port 3003; set `PORT` to override it.

| Script | Native command |
| --- | --- |
| `dev` | `bun --watch run src/index.ts` |
| `build` | `bun build --target=bun --outdir=dist src/index.ts` |
| `start` | `bun run dist/index.js` |

`src/app.ts` uses Elysia's `.mount("/mcp", handler)` so its body parser does not consume MCP input. `src/index.ts` calls `.listen()` on Bun; `src/server.ts` defines the tools. Both development and production run on Bun.

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
SSE and Clerk/OAuth are separate work. Toolgrain packages are private workspace
packages, so this example currently runs from this repository.
