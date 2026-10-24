# Errors and private diagnostics

Toolgrain distinguishes protocol errors, expected tool feedback, and unexpected application failures. This keeps useful validation feedback public without disclosing provider errors or internal exceptions.

| Situation | Client sees | `onError` |
| --- | --- | --- |
| Unknown tool or invalid protocol message | Protocol error | Not for expected rejections |
| Ordinary invalid input | Tool error with validation feedback | Not reported |
| Valid explicit `mcpResult({ isError: true })` | Your public content | Not reported |
| Unexpected parsing, output, handler, or provider failure | `Tool execution failed`, no structured data | Original thrown value plus tool details |
| Unexpected auth failure or provider outage | Auth response | Original value, no tool details |
| Failure after cancellation | No late response | Suppressed |

## Configure diagnostics

```ts
const server = createServer({
  name: "hello", version: "1.0.0", tools: { greet },
  onError(error, details) {
    console.error("Toolgrain error", {
      error,
      tool: details?.toolName,
      requestId: details?.request.id,
    });
  },
});
```

`ToolErrorDetails` is frozen and contains `toolName` and the existing frozen `ToolRequest`. Tool arguments and auth identity/credentials are not added. Request metadata is client-supplied; assess what you log and do not assume arbitrary metadata is safe or verified.

Transport and internal request diagnostics retain the one-argument form. Existing single-argument callbacks continue to work. Synchronous throws and asynchronous rejections from diagnostics cannot disrupt the response or cleanup.

## Construction failures

`ToolNameError` identifies an invalid registration key. `ToolSchemaError` includes the tool name, `schemaKind` (`input`, `output`, or `metadata`), and the underlying cause. Correct these before starting the server; they are not tool-call errors.

## Public application errors

Use an explicit error result only for feedback you intend the client to receive. Do not copy raw database, network, or provider exceptions into it. A direct call to a handler or provider accessor retains raw thrown values; private server error conversion applies when executing through the server.
