# Changelog

All six Toolgrain libraries share one version and this changelog. Entries under
Unreleased describe work that has not been published to npm.

## [Unreleased]

### Added

- Initial `@toolgrain/mcp` authoring API with reusable typed tools, Zod 4 Classic
  and Mini schemas, parsed inputs and outputs, and explicit rich results.
- MCP `2026-07-28` and `2025-06-18` support through `@toolgrain/protocol`, Node
  stdio, and independent HTTP requests using `@toolgrain/node` and
  `@toolgrain/http`.
- Cooperative cancellation, frozen request context, and lazy request-cached
  context providers with inferred accessors and typed overrides.
- HTTP authorization through `@toolgrain/jwt` and `@toolgrain/clerk`, including
  protected-resource metadata and verified request identities.
- Framework examples, packed-consumer verification, and a supported runtime and
  dependency matrix. See the [support policy](docs/support-policy.md).

### Known limitations

- Client interoperability remains partially verified. See the
  [interoperability report](docs/interoperability-2026-10-22.md) for tested
  versions, client behavior limitations, and outstanding checks.
