---
"@toolgrain/clerk": patch
---

Fix `401 invalid_token` responses for valid Clerk opaque OAuth access tokens when Clerk's verification response omits the `type` field. Retain rejection of incompatible explicit token types, revoked or expired tokens, invalid user/client identities, and incorrect resource audiences.
