<p align="center">
  <img src="./brand/readme-banner.svg" alt="Toolgrain — a TypeScript toolkit for MCP" width="1200">
</p>

<h1 align="center">Bring your TypeScript<br>application to MCP.</h1>

<p align="center">
  Define reusable tools with Zod. Compose them into servers.<br>
  Serve them from your existing Node or Bun application.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@toolgrain/mcp"><img src="https://img.shields.io/npm/v/%40toolgrain%2Fmcp?style=flat-square&amp;labelColor=20282B&amp;color=E4EE85&amp;label=npm" alt="MCP package on npm"></a>
  <a href="https://github.com/keshavkatwe/toolgrain/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/keshavkatwe/toolgrain/ci.yml?branch=main&amp;style=flat-square&amp;labelColor=20282B&amp;label=checks" alt="CI checks on main"></a>
  <a href="https://toolgrain.mintlify.site/project/support-policy"><img src="https://img.shields.io/badge/Node.js-%5E24.20.0-20282B?style=flat-square" alt="Node.js: ^24.20.0"></a>
  <a href="https://toolgrain.mintlify.site/project/support-policy"><img src="https://img.shields.io/badge/Bun-%3E%3D1.4.4%20%3C2-20282B?style=flat-square" alt="Bun applications: at least 1.4.4, below 2"></a>
  <a href="https://toolgrain.mintlify.site/project/support-policy"><img src="https://img.shields.io/badge/TypeScript-5.5.4%2B-20282B?style=flat-square" alt="TypeScript: 5.5.4 or later"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/Toolgrain_code-MIT-20282B?style=flat-square" alt="Toolgrain code: MIT license"></a>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="https://toolgrain.mintlify.site/">Documentation</a> ·
  <a href="https://toolgrain.mintlify.site/examples">Examples</a> ·
  <a href="#packages">Packages</a> ·
  <a href="./.github/CONTRIBUTING.md">Contributing</a>
</p>

---

Expose your application's services to
[Model Context Protocol](https://modelcontextprotocol.io/) clients through
standalone, schema-validated tools. Reuse the definitions across servers and
choose stdio or HTTP for each application.

## Quickstart

### 1. Install

Use Node.js **`^24.20.0`** and a TypeScript project with **strict mode** enabled.
In a new project directory, initialize npm and install matching stable Toolgrain
packages from npm's `latest` tag:

```sh
npm init -y
npm install @toolgrain/mcp @toolgrain/node zod@^4.6.6
npm install --save-dev typescript @types/node@^24.10.0
```

### 2. Define your tool and server

Save as `server.mts`. The registration key `greet` is the name clients use to
discover and call the tool.

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

### 3. Compile

```sh
npx tsc server.mts --strict --module NodeNext --target ES2022 --types node
```

### 4. Call your tool

Use MCP Inspector's CLI to start the compiled server and call `greet`:

```sh
npx --yes @modelcontextprotocol/inspector@2.11.0 --cli \
  --protocol-era modern --format json \
  --method tools/call --tool-name greet --tool-args-json '{"name":"Ada"}' \
  node server.mjs
```

Inspector launches the server, prints the response, and exits. The response's
`result.structuredContent` contains:

```json
{ "message": "Hello, Ada!" }
```

The result also includes the same JSON as text in `content`. For regular use,
configure your MCP client to start `node` with the absolute path to `server.mjs`
as its argument. The server waits for MCP requests on stdin; keep application
logs on stderr. See [client compatibility](https://toolgrain.mintlify.site/compatibility/protocol) for verified
client versions and setup.

### Prefer HTTP?

Replace the `stdio` import and the last line with:

```ts
import { http } from "@toolgrain/node";

await server.listen(http({ port: 3000 }));
```

Your endpoint is `http://127.0.0.1:3000/mcp`. Call `server.close()` during
application shutdown. See [transports](https://toolgrain.mintlify.site/transports/overview) for existing
listeners, HTTP headers, production hosts, and cancellation, or start from a
[framework example](https://toolgrain.mintlify.site/examples).

## Why Toolgrain?

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>Types follow your schemas</h3>
      Zod infers handler inputs and checks declared outputs. Runtime parsing
      applies defaults and transforms to inputs and outputs.
    </td>
    <td width="50%" valign="top">
      <h3>Tools compose</h3>
      Reuse standalone definitions across servers. Access application dependencies
      through typed, request-cached context providers.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Choose your transport</h3>
      Start with stdio, run a Node HTTP listener, or mount a Web or Node handler
      in your application. Keep the same tool definitions.
    </td>
    <td width="50%" valign="top">
      <h3>Add authorization</h3>
      Protect HTTP endpoints with JWT or Clerk OAuth verification. Read typed,
      verified identities inside your handlers.
    </td>
  </tr>
</table>

Toolgrain implements MCP directly, independently of `@modelcontextprotocol/sdk`.
The current scope is tool discovery and execution across two protocol revisions;
see [support and scope](#support-and-scope) before choosing it for your project.

## Build beyond hello

| You want to… | Start here |
| --- | --- |
| Reuse tools, validate outputs, or return rich content | [Tool authoring](https://toolgrain.mintlify.site/tools/overview) |
| Access request details or cancel work | [Handler context](https://toolgrain.mintlify.site/tools/overview#handler-context) |
| Inject a database or service into tools | [Context providers](https://toolgrain.mintlify.site/guides/context) |
| Protect an HTTP endpoint with JWT or Clerk | [Authorization](https://toolgrain.mintlify.site/guides/authorization) |
| Connect Inspector or check tested clients | [Compatibility](https://toolgrain.mintlify.site/compatibility/protocol) |
| Use Express, Hono, Elysia, or Next.js | [Runnable examples](https://toolgrain.mintlify.site/examples) |

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

Stable packages are [available on npm](https://www.npmjs.com/package/@toolgrain/mcp)
under `latest`. Install the same version across Toolgrain libraries.

| Requirement | Supported |
| --- | --- |
| Module format | ESM |
| Node.js | `^24.20.0` |
| Bun applications | `>=1.4.4 <2` |
| TypeScript | 5.5.4+ with strict mode |
| Zod | `^4.6.6`, Classic or Mini |
| MCP | `2026-07-28` and initialization-based `2025-06-18` |

Node 26 is preview. Repository tooling uses Bun **1.3.14**, separately from the
application runtime. See the [support policy](https://toolgrain.mintlify.site/project/support-policy).

Both protocol revisions share the same tool API over stdio and HTTP. HTTP uses
independent POST requests and JSON responses.
Sessions, SSE, resumability, resources, prompts, elicitation, progress, and
subscriptions are outside the current implementation. Check the
[client verification notes](https://toolgrain.mintlify.site/compatibility/protocol) and [roadmap](./ROADMAP.md)
for tested flows and planned work.

## Contribute

Bug reports, documentation improvements, and focused proposals are welcome.
Read [CONTRIBUTING](./.github/CONTRIBUTING.md) for setup, checks, and release
records, and follow the [Code of Conduct](./.github/CODE_OF_CONDUCT.md).
For vulnerabilities, use the private contact in [SECURITY](./.github/SECURITY.md).

## License

<p align="center">
  Toolgrain-owned code and artwork are <a href="./LICENSE">MIT licensed</a>.<br>
  Copyright 2026 Keshav Katwe.
</p>

<p align="center">
  Vendored protocol material and the bundled font retain their upstream terms.<br>
  <a href="./NOTICE">Notices</a> ·
  <a href="./packages/protocol/LICENSE">Protocol license</a> ·
  <a href="./brand/README.md">Brand sources</a>
</p>
