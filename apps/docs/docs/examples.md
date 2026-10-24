# Runnable examples

Each application is an independent workspace with its own framework dependencies and process smoke test. They import compiled library exports. From the repository root, install the pinned dependencies and build before running a selected example:

```bash
bun install --frozen-lockfile
bun run build
bun run --cwd apps/http-example dev
```

The repository uses Bun 1.3.14 as a development package manager. Supported Bun application execution starts at 1.4.4; use the supported runtime when evaluating production behavior.

| Example | Focus | Default port |
| --- | --- | --- |
| [stdio-example](https://github.com/keshavkatwe/toolgrain/tree/main/apps/stdio-example) | A full local MCP server and subprocess flow | stdin/stdout |
| [http-example](https://github.com/keshavkatwe/toolgrain/tree/main/apps/http-example) | Plain Node HTTP | 3000 |
| [express-example](https://github.com/keshavkatwe/toolgrain/tree/main/apps/express-example) | Node middleware mounted before body parsing | 3001 |
| [hono-example](https://github.com/keshavkatwe/toolgrain/tree/main/apps/hono-example) | Web handlers with Hono's Node server | 3002 |
| [elysia-example](https://github.com/keshavkatwe/toolgrain/tree/main/apps/elysia-example) | Bun/Elysia and a separate protected Clerk variant | 3003 / 3007 |
| [nextjs-example](https://github.com/keshavkatwe/toolgrain/tree/main/apps/nextjs-example) | App Router with Web handlers | 3005 |
| [jwt-example](https://github.com/keshavkatwe/toolgrain/tree/main/apps/jwt-example) | Protected HTTP with JWT verification | See its README |

HTTP applications have `inspect` scripts that connect to an already running example. The stdio Inspector script launches a compiled child process. The root dev command starts every workspace watcher and example server, so use a selected workspace when you only need one application.

The protected Clerk flow is explicit: `bun run --cwd apps/elysia-example dev:clerk`. It requires local keys and OAuth application configuration; ordinary Elysia dev remains credential-free. Its README covers Inspector PKCE configuration.

Use [framework recipes](transports/frameworks.md) for the adapter boundaries and the linked source for complete startup/shutdown behavior. Example code is teaching material, not a deployment or credential-management service.
