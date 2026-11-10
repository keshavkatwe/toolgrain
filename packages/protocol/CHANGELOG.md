# @toolgrain/protocol

## 0.4.0

### Patch Changes

- 56b7de5: Update packaged documentation for stable 0.3.0 availability and remove prepublication installation warnings.

## 0.3.0

### Minor Changes

- 1cde354: Add named Apps resource, styling, theme-token, and content-modality wire types,
  with explicit host capability advertisements and pinned specification/type
  provenance. Preserve custom styling variables and unknown host capability fields.
  
  `AppToolMeta` now rejects resource-only CSP and permissions, including metadata
  assigned through a variable. Put those fields on the resource content item's
  `_meta.ui`; tool metadata retains its resource URI and visibility settings.
  
  Document React widgets, matching-version installation, resource
  metadata examples, and implemented versus deferred React protocol features.
- 712e975: Add native React host actions for links, user messages, replacement model context,
  and display modes, with capability checks, cancellation/deadlines, and typed
  request/result contracts. Let providers declare supported display modes and expose
  live action availability through `useHostActions()`.
- 1cde354: Add native MCP Apps protocol contracts and typed React widgets with shared-entry routing.

### Patch Changes

- 414e8f5: Clarify MCP Apps installation, browser support, and implemented React APIs for the combined 0.3.0 release; preserve dated prerelease acceptance evidence.

## 0.2.0

No changes in this release.

## 0.1.3

No changes in this release.

## 0.1.2

### Patch Changes

- da94c47: Document the public API with JSDoc for exported types, members, options, and functions. Preserve field documentation in auth accessor return types and protocol constant hovers.
- f199707: Point package homepages and README documentation links to the live Toolgrain documentation site.
- d0c10ac: Use matching stable Toolgrain packages in installation instructions instead of
  embedding outdated release pins.

## 0.1.1

### Patch Changes

- 16752a8: Refresh package READMEs with Toolgrain branding, clearer package roles, and direct
  links to the tool, transport, and authorization guides. Clarify the supported Zod
  version in installation commands and explicitly load Node types when compiling
  the Node examples with current TypeScript.

## 0.1.0

Initial stable release. See the [0.1.0 release notes](https://github.com/keshavkatwe/toolgrain/releases/tag/v0.1.0) for installation instructions and known limitations.
