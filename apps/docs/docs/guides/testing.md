# Test tools and server behavior

Use direct calls for application logic and server calls for validation, result conversion, diagnostics, and authorization. A passing direct handler test does not establish the public MCP contract.

## Direct handler test

```ts
import assert from "node:assert/strict";
import { toolContext } from "@toolgrain/mcp";
import { greet } from "./tools/greet.js";

const result = await greet.execute({ name: "Ada" }, toolContext());
assert.deepEqual(result, { message: "Hello, Ada!" });
```

This assumes the output-schema version of `greet` from the quickstart. Inputs here are already the handler's parsed values. Direct calls bypass parsing, output validation, authorization, and MCP conversion.

## Test the server boundary

```ts
const server = createServer({ name: "test", version: "1.0.0", tools: { greet } });
try {
  const response = await server.handle({
    jsonrpc: "2.0", id: "test-1", method: "tools/call",
    params: {
      name: "greet", arguments: { name: "Ada" },
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  });
  assert.ok(response && "result" in response);
} finally {
  await server.close();
}
```

Also assert the structured result and text blocks for your tool. Send invalid input and check that the handler is not invoked; use an incompatible result to test output failure. Check that unexpected failures remain generic and reach private `onError` details. Use the actual legacy envelope when checking the older revision rather than only changing a version label.

## Override services

Providers support typed replacements without mutating the original definition:

```ts
const ctx = toolContext({
  context: [database.provide(() => fakeDatabase)],
});
```

Here `database` is your provider and `fakeDatabase` implements its inferred contract. Concurrent accessor calls should share one value per context; fresh contexts should not share request caches. The [context guide](context.md#typed-overrides-and-direct-tests) includes a complete example.

## Transport and auth tests

Test stdio through a real child process to catch stdout pollution, framing, EOF, and cancellation. Test HTTP through its adapter/listener to cover hosts, headers, body limits, metadata routes, authorization ordering, and disconnects. `server.handle()` alone does not exercise those HTTP boundaries.

For protected direct tests, obtain a scope with `authorize()`, pass it to `handle()`, and dispose it in `finally`. Stub trusted signing keys or token-verification responses rather than requiring live secrets in ordinary tests. Keep live login interoperability checks separate and record client/runtime versions.
