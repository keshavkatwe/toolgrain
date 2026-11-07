---
"@toolgrain/mcp": patch
---

Pace request-scoped progress notifications at 100 ms intervals while preserving ordered delivery, backpressure, and prompt cancellation. Reject duplicate active progress tokens on shared message connections, release tokens on completion or cancellation, and preserve isolation between independent HTTP response streams.
