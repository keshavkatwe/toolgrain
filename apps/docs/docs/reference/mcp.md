# @toolgrain/mcp

The public authoring API for reusable tools and servers. Import protocol wire definitions directly from `@toolgrain/protocol`; MCP does not re-export them. All packages remain unpublished.

## createServer

```ts
createServer<const Tools extends ToolMap>(options: ServerOptions<Tools>): Server
```

| `ServerOptions` field | Contract |
| --- | --- |
| `name`, `version` | Required server identity strings |
| `tools` | Required registration-name → `tool()` definition map |
| `instructions` | Optional server instructions |
| `onError` | Optional `(error: unknown, details?: ToolErrorDetails) => void` diagnostic callback |
| `auth` | Optional `AuthProvider`, for HTTP request authorization |
| `context` | Optional readonly provider/binding array |

Construction validates tool names, representable schemas, metadata, and provider registrations. It does not open a transport. Registrations are snapshots; definitions remain reusable.

### Server methods

| Method | Returns / behavior |
| --- | --- |
| `listen(transport)` | `Promise<void>`; starts one `Transport` or `RequestTransport` |
| `close()` | `Promise<void>`; terminal, idempotent, re-entrant cleanup and cancellation |
| `handle(message, options?)` | `Promise<ProtocolResponse \| undefined>`; processes a complete decoded request |
| `getToolDefinitions()` | Copied modern protocol tool metadata |
| `getAuthMetadata()` | `AuthMetadata \| undefined` |
| `authorize(token, { resource, signal? })` | `Promise<AuthScope>`; server-bound, single-use authorization |

`HandleOptions` contains optional `signal`, `protocolVersion`, and `auth`. The protocol version is a supported revision; `auth` is a scope from this server. Always dispose an authorization scope in `finally`. `handle()` is not an HTTP validation boundary. A closed server cannot restart. Auth-configured servers reject message transports.

## tool

```ts
tool({ input, execute, output?, title?, description?, annotations?, icons?, _meta? })
```

Returns a frozen branded `Tool<Schema, Result, Output>`. `input` is a Zod 4 schema with an object root when exposed. `execute(input, ctx)` receives the schema's parsed output and required `ToolContext`. The optional output schema constrains return values and is parsed during server execution. `tool()` overloads infer schema/result types; users do not normally supply type arguments.

`ToolDefinition<Schema, Result, Output>` describes the authored fields and raw handler. `ToolMetadata` is the readonly protocol metadata subset. `ToolMap` is the heterogeneous registration contract. The public `Tool` class represents the branded definition; prefer `tool()` for checked inference and variants. Raw objects/spreads are not valid registrations. `definition.execute` remains a direct handler call, bypassing server processing.

See [definitions](../tools/definitions.md), [validation](../tools/validation.md), and [request context](../guides/request-context.md).

## mcpResult

```ts
mcpResult({ content, structuredContent?, isError?, _meta? })
```

Wraps explicit MCP content. `content` is a required readonly array of protocol content blocks. `structuredContent` must be JSON-compatible. Result `_meta` carries metadata; `isError` explicitly marks safe public tool feedback. Conversion validates/copies content and supplies serialized structured text.

| Exported type | Meaning |
| --- | --- |
| `McpResultOptions<Structured>` | Authoring envelope: `content`, optional structured data, error flag, metadata |
| `McpResult<Structured>` | Branded explicit result wrapper, with readonly `value` |
| `McpStructuredResult<Structured>` | A result guaranteed to include structured content |
| `McpErrorResult<Structured>` | A result guaranteed to have `isError: true` |

Overloads preserve structured-data presence and explicit error flags. Successful results with an output schema require structured content; text-only explicit errors remain valid. Use `McpStructuredResult<T>` for typed reusable helpers, rather than widening to a possibly unstructured result. [Result rules](../tools/results.md) cover conversion differences between revisions.

## Errors and diagnostics

- `ToolNameError(toolName)` exposes `toolName` for an invalid registration key.
- `ToolSchemaError(toolName, cause, schemaKind?)` exposes the underlying cause and `schemaKind`, defaulting to `"input"`; other kinds are `"output"` and `"metadata"`.
- `ToolErrorDetails` contains readonly `toolName` and frozen `request: ToolRequest`. Arguments and auth identity are not added.

`onError` receives original unexpected failures. Expected protocol/input/explicit tool errors are not reported, late cancelled failures are suppressed, and diagnostics cannot interrupt cleanup or a response. See [error handling](../tools/errors.md).

## Other exports

The [context reference](context.md) covers `ToolContext`, `ToolRequest`, `ToolClient`, `ToolContextOptions`, `toolContext`, `ContextProvider`, and `createContext`. The [auth reference](auth.md) covers shared authorization exports. [Custom transports](../transports/custom.md) use the following public contracts:

```ts
interface TransportCallbacks {
  onMessage(message: unknown): void;
  onParseError(error: unknown): void;
  onError(error: unknown): void;
  onClose(): void;
}
interface Transport {
  readonly mode?: "message";
  start(callbacks: TransportCallbacks): Promise<void>;
  send(message: ProtocolResponse): Promise<void>;
  close(): Promise<void>;
}
interface RequestTransport {
  readonly mode: "request";
  start(server: Server, callbacks: Pick<TransportCallbacks, "onError" | "onClose">): Promise<void>;
  close(): Promise<void>;
}
```

`ProtocolResponse` above is imported from protocol. There is no exported internal registry, adapter, or separate core package. [Public source](https://github.com/keshavkatwe/toolgrain/blob/main/packages/mcp/src/index.ts).
