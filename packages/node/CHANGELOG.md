# @toolgrain/node

## 0.3.0-alpha.0

### Minor Changes

- Add request-scoped progress reporting through `ctx.reportProgress()` with stdio notifications and HTTP SSE delivery. The bound reporter honors client progress tokens, increasing values, backpressure, cancellation, and normal final tool results. HTTP opens SSE on the first progress update and retains JSON responses when no progress is sent.

  Custom message transports must accept progress notifications alongside protocol responses. Direct `server.handle()` integrations can supply `onNotification` for request-scoped delivery; contexts without a delivery channel use a no-op reporter.

  Keep final HTTP SSE delivery active until it completes or is cancelled, including server shutdown while the final write is blocked by backpressure.

### Patch Changes

- Updated dependencies
  - @toolgrain/http@0.3.0-alpha.0
  - @toolgrain/mcp@0.3.0-alpha.0
  - @toolgrain/protocol@0.3.0-alpha.0

## 0.2.0

### Patch Changes

- Updated dependencies [2931553]
  - @toolgrain/mcp@0.2.0
  - @toolgrain/http@0.2.0
  - @toolgrain/protocol@0.2.0

## 0.1.3

### Patch Changes

- @toolgrain/http@0.1.3
  - @toolgrain/mcp@0.1.3
  - @toolgrain/protocol@0.1.3

## 0.1.2

### Patch Changes

- da94c47: Document the public API with JSDoc for exported types, members, options, and functions. Preserve field documentation in auth accessor return types and protocol constant hovers.
- f199707: Point package homepages and README documentation links to the live Toolgrain documentation site.
- d0c10ac: Use matching stable Toolgrain packages in installation instructions instead of
  embedding outdated release pins.
- Updated dependencies [da94c47]
- Updated dependencies [f199707]
- Updated dependencies [d0c10ac]
  - @toolgrain/http@0.1.2
  - @toolgrain/mcp@0.1.2
  - @toolgrain/protocol@0.1.2

## 0.1.1

### Patch Changes

- 16752a8: Refresh package READMEs with Toolgrain branding, clearer package roles, and direct
  links to the tool, transport, and authorization guides. Clarify the supported Zod
  version in installation commands and explicitly load Node types when compiling
  the Node examples with current TypeScript.
- Updated dependencies [16752a8]
  - @toolgrain/mcp@0.1.1
  - @toolgrain/http@0.1.1
  - @toolgrain/protocol@0.1.1

## 0.1.0

Initial stable release. See the [0.1.0 release notes](https://github.com/keshavkatwe/toolgrain/releases/tag/v0.1.0) for installation instructions and known limitations.
