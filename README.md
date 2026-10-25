<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./brand/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./brand/logo-light.svg">
    <img src="./brand/logo-light.svg" alt="Toolgrain" width="320" height="76">
  </picture>
</p>

<h1 align="center">Typed tools. Composable MCP servers.</h1>

<p align="center">
  Define tools with Zod. Bring your application logic.<br>
  Serve them over stdio or HTTP with the same TypeScript API.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@toolgrain/mcp"><img src="https://img.shields.io/npm/v/%40toolgrain%2Fmcp?color=20282B&amp;label=npm" alt="MCP package on npm"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/Toolgrain_code-MIT-20282B" alt="Toolgrain code: MIT license"></a>
  <a href="./docs/support-policy.md"><img src="https://img.shields.io/badge/TypeScript-strict-20282B" alt="Strict TypeScript"></a>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="./docs/README.md">Documentation</a> ·
  <a href="./apps/README.md">Examples</a> ·
  <a href="./.github/CONTRIBUTING.md">Contributing</a>
</p>

Toolgrain is a TypeScript toolkit for building [Model Context Protocol](https://modelcontextprotocol.io/)
servers. Start with a tool, compose a server, then choose how clients connect.

## Why Toolgrain?

- **Types follow your schemas.** Zod infers handler inputs and checks declared
  outputs. Inputs and outputs are parsed at runtime, including defaults and transforms.
- **Tools compose.** Reuse standalone definitions across servers. Resolve
  application dependencies through typed, request-cached context accessors.
- **Transport is a choice.** Use stdio, own a Node HTTP listener, or mount a Web
  or Node handler in your application. Tool definitions stay the same.
- **Auth fits the server.** Add JWT or Clerk OAuth verification to an HTTP
  endpoint, with typed identities available inside handlers.

Toolgrain implements MCP directly, independently of `@modelcontextprotocol/sdk`.
The current scope is tool discovery and execution across two protocol revisions;
see [support and scope](#support-and-scope) before choosing it for your project.

## Quickstart

Use Node.js **`^24.20.0`** and a TypeScript project with **strict mode** enabled.
Install the stable `0.1.0` packages:

```sh
npm install @toolgrain/mcp@0.1.0 @toolgrain/node@0.1.0 zod@^4.6.6
npm install --save-dev typescript @types/node@^24.10.0
```

Save this as `server.mts`:

```ts
import { createServer, tool } from "@toolgrain/mcp";
import { stdio } from "@toolgrain/node";
import { z } from "zod";

const greet = tool({
  description: "Greet someone by name",
  annotations: { readOnlyHint: true },
  input: z.object({ name: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  execute: ({ name }) => ({ message: `Hello, ${name}!` }),
});

const server = createServer({
  name: "hello-server",
  version: "1.0.0",
  tools: { greet },
});

await server.listen(stdio());
```

Compile and run:

```sh
npx tsc server.mts --strict --module NodeNext --target ES2022 --types node
node server.mjs
```

The server waits for MCP requests on stdin. Configure your MCP client to start
`node` with the absolute path to `server.mjs` as its argument. Calling `greet`
with `{ "name": "Ada" }` returns `{ "message": "Hello, Ada!" }` as structured
content and text. Keep application logs on stderr.

Want an HTTP endpoint? Replace the `stdio` import and the last line with:

```ts
import { http } from "@toolgrain/node";

await server.listen(http({ port: 3000 }));
```

Your endpoint is `http://127.0.0.1:3000/mcp`. Call `server.close()` during
application shutdown. See [transports](./docs/transports.md) for existing
listeners, HTTP headers, production hosts, and cancellation, or start from a
[framework example](./apps/README.md).

## Build beyond hello

| You want to… | Start here |
| --- | --- |
| Reuse tools, validate outputs, or return rich content | [Tool authoring](./docs/tools.md) |
| Access request details or cancel work | [Handler context](./docs/tools.md#handler-context) |
| Inject a database or service into tools | [Context providers](./docs/context.md) |
| Protect an HTTP endpoint with JWT or Clerk | [Authorization](./docs/authorization.md) |
| Connect Inspector or check tested clients | [Compatibility](./docs/compatibility.md) |
| Use Express, Hono, Elysia, or Next.js | [Runnable examples](./apps/README.md) |

## Packages

Install Toolgrain libraries at the same version. Start with `mcp` and the
transport package your application needs; add authorization when you need it.

| Package | Purpose |
| --- | --- |
| [@toolgrain/mcp](./packages/mcp/README.md) | Tools, servers, validation, rich results, and context |
| [@toolgrain/node](./packages/node/README.md) | Stdio, managed HTTP, and Node HTTP handlers |
| [@toolgrain/http](./packages/http/README.md) | Web `Request`/`Response` handlers |
| [@toolgrain/jwt](./packages/jwt/README.md) | JWT access-token verification |
| [@toolgrain/clerk](./packages/clerk/README.md) | Clerk OAuth access-token verification |
| [@toolgrain/protocol](./packages/protocol/README.md) | Pinned MCP wire types and version constants |

## Support and scope

Stable **0.1.0** is [available on npm](https://www.npmjs.com/package/@toolgrain/mcp).
Packages are ESM. Supported application runtimes are Node.js **`^24.20.0`** and
Bun **`>=1.4.4 <2`**, with TypeScript **5.5.4+** in strict mode and Zod **`^4.6.6`**
(Classic or Mini). Node 26 is preview. The repository itself uses Bun 1.3.14
for tooling. See the [support policy](./docs/support-policy.md).

MCP **`2026-07-28`** and initialization-based **`2025-06-18`** share the same tool
API over stdio and HTTP. HTTP uses independent POST requests and JSON responses.
Sessions, SSE, resumability, resources, prompts, elicitation, progress, and
subscriptions are outside the current implementation. Check the
[client verification notes](./docs/compatibility.md) and [roadmap](./ROADMAP.md)
for tested flows and planned work.

## Contribute

Bug reports, documentation improvements, and focused proposals are welcome.
Read [CONTRIBUTING](./.github/CONTRIBUTING.md) for setup, checks, and release
records, and follow the [Code of Conduct](./.github/CODE_OF_CONDUCT.md).
For vulnerabilities, use the private contact in [SECURITY](./.github/SECURITY.md).

## License

Toolgrain-owned code and artwork are [MIT licensed](./LICENSE), copyright
2026 Keshav Katwe. Vendored protocol material and the bundled font retain their
upstream terms. See [NOTICE](./NOTICE), the
[protocol license](./packages/protocol/LICENSE), and [brand sources](./brand/README.md).
