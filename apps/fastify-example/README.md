# Fastify example

This is an independent application with its own dependencies and native development workflow.

From the repository root, install dependencies and build Toolgrain first:

```sh
bun install --frozen-lockfile
bun run build
cd apps/fastify-example
bun run dev
```

The development endpoint is `http://127.0.0.1:3004/mcp`.
For a production-style run inside this directory:

```sh
bun run build
bun run start
```

The start command defaults to port 3000; set `PORT` to override it.

| Script | Native command |
| --- | --- |
| `dev` | `fastify start --watch --address 127.0.0.1 --port 3004 src/app.ts` |
| `build` | `tsc -p tsconfig.build.json` |
| `start` | `fastify start --address 127.0.0.1 dist/app.js` |

`src/app.ts` exports a normal Fastify plugin. The CLI owns listening and shutdown. The MCP route uses an encapsulated raw buffer parser (1 MiB) and sends a native Web Response through `reply.send()`. `src/server.ts` defines the tools. Parser-level failures follow Fastify's error handling. Development uses `fastify-cli` watch mode and the repository's Node 24 native TypeScript support. TypeScript rewrites local `.ts` imports to `.js` for production builds.

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
