# Toolgrain examples

Each example is a separate application. Framework dependencies and runtime
configuration stay in that framework's workspace; applications do not import
code from sibling examples.

Every example imports `tool` and `createServer` from `@toolgrain/mcp`. The greeting
tool declares its title, behavioral annotations, and Zod output schema directly.
Smoke tests verify metadata, schema discovery, and execution in both protocol eras.

| Application | Development workflow | Development port |
| --- | --- | --- |
| [Plain Node HTTP](./http-example/README.md) | tsx watcher + Node HTTP | 3000 |
| [Express](./express-example/README.md) | tsx watcher + Express | 3001 |
| [Hono](./hono-example/README.md) | tsx watcher + Hono Node adapter | 3002 |
| [Elysia](./elysia-example/README.md) | Bun watch + Elysia | 3003 |
| [Next.js](./nextjs-example/README.md) | next dev / next build / next start | 3005 |
| [JWT authorization](./jwt-example/README.md) | tsx watcher + protected Node HTTP | 3006 |
| [Stdio](./stdio-example/) | TypeScript watch build; separate Inspector launch | — |

Start with `bun install --frozen-lockfile` and `bun run build` from the repository
root. Then enter an example and run its documented scripts. Root `bun run dev`
runs the library watch builds and each app's native development command.

`bun run test:examples` runs uninstrumented smoke/integration tests. Each HTTP app
is tested through its own start command; stdio uses its existing subprocess tests.
`bun run test:coverage` measures library coverage and verifies protocol integrity.
CI runs both tasks and publishes test results for every workspace.

The unauthenticated HTTP examples also have `bun run inspect`. Start its dev server first, then
run Inspector in a second terminal in the same example directory. The launcher
pins Inspector 2.11.0 and modern protocol mode. Override the URL with
`bun run inspect http://127.0.0.1:4000/mcp` when using a different port.
