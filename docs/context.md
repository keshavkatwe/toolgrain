# Lazy context providers

Define reusable providers with `createContext()` from `@toolgrain/mcp`. Export
`provider.use` under an application-specific name such as `useDatabase`. Toolgrain
infers the returned value from the resolver, including asynchronous resolvers;
no explicit context type arguments or generic `ToolContext` are needed.

## Define providers and standalone tools

```ts
import { createContext, createServer, tool } from "@toolgrain/mcp";
import { stdio } from "@toolgrain/node";
import { z } from "zod";

// An application-owned database client or pool. Replace this with your client.
const sharedDatabase = {
  async findUser(id: string, signal: AbortSignal) {
    signal.throwIfAborted();
    return { id, name: "Ada" };
  },
};

export const database = createContext({
  name: "database",
  resolve: () => sharedDatabase,
});
export const useDatabase = database.use;

export const services = createContext({
  name: "services",
  async resolve(ctx) {
    const db = await useDatabase(ctx);
    return {
      findUser: (id: string) => db.findUser(id, ctx.signal),
    };
  },
});
export const useServices = services.use;

export const findUser = tool({
  input: z.object({ id: z.string() }),
  async execute({ id }, ctx) {
    const services = await useServices(ctx);
    return services.findUser(id);
  },
});

const server = createServer({
  name: "users",
  version: "1.0.0",
  tools: { findUser },
  context: [services, database],
});
await server.listen(stdio());
```

The registration order does not matter. Calling `useServices(ctx)` starts its
resolver, which calls `useDatabase(ctx)` to resolve its dependency. Both providers
must be registered explicitly; accessor calls do not register dependencies.
The same providers work with HTTP and both supported MCP revisions.

## Resolution and request caching

Every accessor returns a `Promise`, even when its resolver is synchronous.
Resolve dependencies inside the resolver and await their accessors. Returned
service methods can then use those resolved dependencies. Accessors should be
awaited within the active handler or resolver, rather than used for background work.

Factories run on first access, after authorization and tool input validation.
Discovery, tool listing, unknown tools, invalid input, and unused registrations
never start factories. A context caches one promise per provider: concurrent
readers share the same in-flight work and receive the same value. Failures are
cached too; a later access in that context does not retry the factory. A fresh
request gets a fresh cache, even if the request ID matches another request.

Provider names must be nonempty strings and label diagnostic messages. Identity
belongs to the definition, so two independently created providers with the same
name are distinct. Registering the same identity twice, including its overrides,
is a construction error. Definitions and registration snapshots are immutable.
Providers from compatible installed copies of `@toolgrain/mcp` interoperate.

Context values may contain functions, class instances, and mutable database
clients. They are returned unchanged, without copying or freezing. Request caching
does not make an existing shared pool request-owned: if the resolver returns a
shared client, requests intentionally receive that client. Applications own
creation and disposal of resources; this version adds no cleanup hooks,
transactions, or automatic pool/connection closing.

## Typed overrides and direct tests

`.provide(resolver)` creates a new binding with the original provider's identity
and value type. Existing accessors find that binding without changing the original
provider, another server, or another context. Both sync and async overrides are
supported and must return the complete inferred contract.

```ts
import { toolContext } from "@toolgrain/mcp";

const fakeDatabase = {
  async findUser(id: string, signal: AbortSignal) {
    signal.throwIfAborted();
    return { id, name: "Test user" };
  },
};
const ctx = toolContext({
  context: [services, database.provide(() => fakeDatabase)],
});
const user = await findUser.execute({ id: "user_1" }, ctx);
```

Use the same override in a server's `context` array for per-server configuration.
Register the override instead of the original provider. `toolContext()` defaults
to no providers, with a fresh cache each time; reusing one context reuses its cache.
Direct `execute()` calls remain raw calls: they bypass server authorization,
argument/output validation, and MCP conversion. Test protected execution through
`authorize()` and `handle()` as described in the [authorization guide](./authorization.md).

## Authorization and cancellation

A resolver receives `ToolContext` with the same request data, `AbortSignal`, and
verified identity as the tool. Authorization remains eager and independent of
lazy context resolution. Integration-specific `useAuth(ctx)` stays synchronous:

```ts
import { useAuth } from "@toolgrain/clerk";

const account = createContext({
  name: "account",
  async resolve(ctx) {
    const { userId } = useAuth(ctx);
    const db = await useDatabase(ctx);
    return db.findUser(userId, ctx.signal);
  },
});
```

Configure Clerk on the server and register `account` and `database`. The frozen
auth snapshot remains available through nested provider calls. Stdio still has
no HTTP authorization identity.

Accessors check cancellation before access, before factory startup, and after
resolution. Pass `ctx.signal` to cancellable work. Cancellation remains
cooperative: a factory ignoring the signal can keep running until it settles,
but its late value is not delivered and the cancelled request sends no response.
Existing client cancellation, disconnect, transport close, and server close
behavior applies to providers too.

## Errors and type safety

A missing registration rejects when accessed, naming the missing provider.
Cycles among pending provider resolutions reject with a diagnostic chain such
as `Context dependency cycle: services -> database -> services`. Concurrent
readers and shared dependency diamonds are valid. Resolver failures propagate
through existing tool-error handling; no new HTTP authorization status is added.

TypeScript infers accessor results and checks overrides. It cannot prove a
standalone tool's dynamically accessed providers are registered on every server;
missing registrations and cycles are runtime errors. Construct contexts with
`toolContext()` rather than hand-written objects.
