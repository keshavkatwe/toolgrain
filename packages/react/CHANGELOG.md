# @toolgrain/react

## 0.3.0-alpha.3

### Minor Changes

- Add native React host actions for links, user messages, replacement model context,
  and display modes, with capability checks, cancellation/deadlines, and typed
  request/result contracts. Let providers declare supported display modes and expose
  live action availability through `useHostActions()`.

### Patch Changes

- Add named Apps resource, styling, theme-token, and content-modality wire types,
  with explicit host capability advertisements and pinned specification/type
  provenance. Preserve custom styling variables and unknown host capability fields.
  
  `AppToolMeta` now rejects resource-only CSP and permissions, including metadata
  assigned through a variable. Put those fields on the resource content item's
  `_meta.ui`; tool metadata retains its resource URI and visibility settings.
  
  Document the published React alpha, matching-version installation, resource
  metadata examples, and implemented versus deferred React protocol features.
- Updated dependencies
- Updated dependencies
  - @toolgrain/protocol@0.3.0-alpha.3
  - @toolgrain/mcp@0.3.0-alpha.3

## 0.3.0-alpha.2

### Minor Changes

- Add native MCP Apps protocol contracts and typed React widgets with shared-entry routing.

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @toolgrain/mcp@0.3.0-alpha.2
  - @toolgrain/protocol@0.3.0-alpha.2
