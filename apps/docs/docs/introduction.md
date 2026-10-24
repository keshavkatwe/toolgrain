---
sidebar_label: Introduction
---

# Build MCP servers with small, typed definitions

Toolgrain is a TypeScript toolkit for turning application functions into tools that MCP clients can discover and call. Define a tool with a Zod input schema and a handler, register it on a server, and choose stdio or HTTP.

```ts
import { createServer, tool } from "@toolgrain/mcp";
import { stdio } from "@toolgrain/node";
import { z } from "zod";

const greet = tool({
  input: z.object({ name: z.string().min(1) }),
  execute: ({ name }) => `Hello, ${name}!`,
});

const server = createServer({
  name: "hello-server",
  version: "1.0.0",
  tools: { greet },
});
await server.listen(stdio());
```

> **In development.** The first planned version is 0.1.0. All six libraries remain private and unpublished. Consumer installation instructions describe the intended dependencies; use the repository examples to try Toolgrain today.

## What MCP adds

The Model Context Protocol defines how a client discovers tools, reads their schemas, and asks a server to execute them. Your server supplies application capabilities; the client decides how to present and invoke them. A schema describes an operation but does not grant authorization to perform it.

Toolgrain implements MCP directly, independently of `@modelcontextprotocol/sdk`. It handles protocol validation and result shaping while your handler owns its application behavior. For the protocol itself, see the [official MCP introduction](https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro).

## Choose the packages you need

| Package | Responsibility |
| --- | --- |
| `@toolgrain/mcp` | Tool definitions, validation, server composition, context, and auth contracts |
| `@toolgrain/node` | Stdio, a managed Node HTTP listener, and Node middleware |
| `@toolgrain/http` | Web Request/Response handlers for an existing application |
| `@toolgrain/jwt` | JWT access-token verification and an identity accessor |
| `@toolgrain/clerk` | Clerk OAuth access-token verification and an identity accessor |
| `@toolgrain/protocol` | Protocol wire types, revision constants, schemas, and provenance |

There is no separate core package. Most applications start with MCP, Node, and Zod; framework applications can use the Web handler instead of owning a listener.

## What you can build now

Reusable tools, asynchronous input/output validation, rich results, request metadata, cooperative cancellation, lazy application services, and protected HTTP endpoints are implemented. The same tool definitions work across both supported protocol revisions and transports.

Resources, prompts, elicitation, subscriptions, progress, sessions, SSE streaming, and resumability are separate future work. Rich results may *contain* resource links or embedded resources; that does not implement the resources API.

Start with [your first stdio server](getting-started/stdio.md), or explore [compatibility and limits](compatibility/overview.md).
