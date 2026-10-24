# Cancellation and execution deadlines

Cancellation is cooperative. Toolgrain aborts `ctx.signal`, prevents a handler from starting after cancelled input validation, and suppresses late responses. Application work stops only if it observes the signal.

```ts
const readRemote = tool({
  input: z.object({ path: z.string() }),
  async execute({ path }, ctx) {
    const response = await fetch(new URL(path, "https://api.example.com"), {
      signal: ctx.signal,
    });
    return response.text();
  },
});
```

For real applications, validate any caller-controlled paths and constrain the destinations the tool may access. The example demonstrates cancellation, not a general remote-fetch service.

## When the signal aborts

- A stdio `notifications/cancelled` message cancels the matching request.
- HTTP caller/disconnect signals propagate through `handle()` and the adapters.
- Transport close, stdin EOF, and server close abort active work.
- A `handle()` caller may pass its own `AbortSignal`.

Signals use `AbortError` reasons for Toolgrain-owned cancellation: client cancellation, connection close, or server close. A caller's own `handle()` abort reason is otherwise preserved. Inspect `ctx.signal.reason` if your application needs the distinction.

Cancelled late failures do not trigger diagnostics. A handler that ignores cancellation can still consume resources; on stdio its request ID remains reserved until it settles.

## Set an application deadline

```ts
async execute(input, ctx) {
  const signal = AbortSignal.any([
    ctx.signal,
    AbortSignal.timeout(10_000),
  ]);
  return applicationService.read(input, { signal });
}
```

Here `applicationService` is your application operation, which must actually honor the signal. A timeout rejection becomes an unexpected tool failure unless your handler intentionally converts it into safe public feedback. Do not merely race a promise and assume the underlying operation has stopped.

Client timeouts are not guaranteed to send cancellation or disconnect promptly. The [interoperability report](../compatibility/clients.md) reproduces this in the tested Codex direct-call API. Toolgrain has no built-in per-tool timeout setting.

Legacy HTTP cancellation notifications are advisory in the independent-request design; they do not introduce a session-wide request map. HTTP disconnects still abort the affected handler. Do not infer cancellation behavior from the arrival of a notification alone.
