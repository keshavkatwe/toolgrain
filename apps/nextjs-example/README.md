# Next.js App Router example

This is an independent application with its own dependencies and native development workflow.

From the repository root, install dependencies and build Toolgrain first:

```sh
bun install --frozen-lockfile
bun run build
cd apps/nextjs-example
bun run dev
```

The development endpoint is `http://127.0.0.1:3005/mcp`.
For a production-style run inside this directory:

```sh
bun run build
bun run start
```

The start command defaults to port 3000; set `PORT` to override it.

| Script | Native command |
| --- | --- |
| `dev` | `next dev --hostname 127.0.0.1 --port 3005` |
| `build` | `next build` |
| `start` | `next start --hostname 127.0.0.1` |

`app/mcp/route.ts` defines the tools and exports the Fetch handler as App Router methods. `app/layout.tsx` and `app/page.tsx` are a minimal Next application. Use the Next CLI directly; there is no custom HTTP server or generated test fixture. Tests run the production `next start` endpoint after `next build`.

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
