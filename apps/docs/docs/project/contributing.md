# Contribute to Toolgrain

Toolgrain implements MCP independently of the official SDK. Changes must preserve the supported wire behavior, typed authoring contract, and compatibility floors. Start with a focused issue or proposal before adding a new protocol capability.

## Local development

Use the repository's pinned Bun 1.3.14 package manager and a supported application runtime. Install with `bun install --frozen-lockfile`. Libraries compile to `dist`; there is no development/source export condition. Framework examples use their native development commands after library builds.

```bash
bun run build
bun run check
bun run check-types
bun run test:coverage
bun run test:examples
bun run test:package
```

Run focused checks while developing, then the checks relevant to the change. `test:coverage` enforces 95% independently for statements, branches, functions, and lines in MCP, Node, HTTP, JWT, and Clerk. Protocol fixtures use integrity checks rather than instrumentation. `test:package` includes compiled export/declaration checks and isolated clean-install consumers.

## Boundaries

`packages/mcp` owns tool authoring and execution. `packages/protocol` owns unchanged upstream schemas, wire types, constants, and provenance. Node and Web adapters own transport-specific concerns, not MCP methods. Keep modern and legacy protocol modules separable. Do not reformat vendored protocol files or update their pinned revision without explicit review.

Do not import implementation from the old framework repository or add `@modelcontextprotocol/sdk`. Keep dependencies pinned and lockfiles reviewed. Runtime/peer-floor increases follow the [support policy](support-policy.md).

## Documentation

The Docusaurus workspace is `apps/docs`. Run `bun run --cwd apps/docs dev` for a local preview on port 3010. Its build synchronizes the shared `brand/` assets and canonical repository guides, then generates a local search index. Edit original guides in root `docs/`; generated copies are ignored. Edit other pages in `apps/docs/docs/`.

Match the approved Monolith design and use the shared brand sources. Keep example commands honest about the unpublished state. Separate supported behavior from dated client evidence. Public API reference changes should accompany implementation changes.

## Release records

Library changes need a Changeset and editorial Unreleased notes. Repository-only work uses an empty record. All six libraries share version 0.1.0 initially; examples and tooling do not publish. The [release guide](releases.md) explains review, versioning, and manual verification. Commits, deployment, and publication have separate authorization boundaries.
