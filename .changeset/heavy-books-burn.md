---
"@toolgrain/http": minor
"@toolgrain/mcp": minor
"@toolgrain/node": minor
---

Add request-scoped progress reporting through `ctx.reportProgress()` with stdio notifications and HTTP SSE delivery. The bound reporter honors client progress tokens, increasing values, backpressure, cancellation, and normal final tool results. HTTP opens SSE on the first progress update and retains JSON responses when no progress is sent.

Custom message transports must accept progress notifications alongside protocol responses. Direct `server.handle()` integrations can supply `onNotification` for request-scoped delivery; contexts without a delivery channel use a no-op reporter.

Keep final HTTP SSE delivery active until it completes or is cancelled, including server shutdown while the final write is blocked by backpressure.
