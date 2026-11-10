# @toolgrain/react

## 0.4.0

### Patch Changes

- 56b7de5: Update packaged documentation for stable 0.3.0 availability and remove prepublication installation warnings.
- 23b424d: Accept the compatible MCP Apps `2025-11-21` initialization reply used by older Grok hosts while continuing to advertise `2026-01-26`. Preserve message-source/origin checks, capability gates and payload validation, and reject unreviewed revisions.
- Updated dependencies [56b7de5]
- Updated dependencies [bfd6bb5]
  - @toolgrain/protocol@0.4.0
  - @toolgrain/mcp@0.4.0

## 0.3.0

### Minor Changes

- 712e975: Add native React host actions for links, user messages, replacement model context,
  and display modes, with capability checks, cancellation/deadlines, and typed
  request/result contracts. Let providers declare supported display modes and expose
  live action availability through `useHostActions()`.
- 1cde354: Add native MCP Apps protocol contracts and typed React widgets with shared-entry routing.

### Patch Changes

- 414e8f5: Clarify MCP Apps installation, browser support, and implemented React APIs for the combined 0.3.0 release; preserve dated prerelease acceptance evidence.
- 1cde354: Add named Apps resource, styling, theme-token, and content-modality wire types,
  with explicit host capability advertisements and pinned specification/type
  provenance. Preserve custom styling variables and unknown host capability fields.
  
  `AppToolMeta` now rejects resource-only CSP and permissions, including metadata
  assigned through a variable. Put those fields on the resource content item's
  `_meta.ui`; tool metadata retains its resource URI and visibility settings.
  
  Document React widgets, matching-version installation, resource
  metadata examples, and implemented versus deferred React protocol features.
- Updated dependencies [0e1669b]
- Updated dependencies [414e8f5]
- Updated dependencies [0e1669b]
- Updated dependencies [e4ac322]
- Updated dependencies [1cde354]
- Updated dependencies [1cf25e6]
- Updated dependencies [712e975]
- Updated dependencies [1cde354]
  - @toolgrain/mcp@0.3.0
  - @toolgrain/protocol@0.3.0
