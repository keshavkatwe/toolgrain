---
"@toolgrain/protocol": minor
"@toolgrain/react": patch
---

Add named Apps resource, styling, theme-token, and content-modality wire types,
with explicit host capability advertisements and pinned specification/type
provenance. Preserve custom styling variables and unknown host capability fields.

`AppToolMeta` now rejects resource-only CSP and permissions, including metadata
assigned through a variable. Put those fields on the resource content item's
`_meta.ui`; tool metadata retains its resource URI and visibility settings.

Document the published React alpha, matching-version installation, resource
metadata examples, and implemented versus deferred React protocol features.
