# Toolgrain documentation

Start with the [quickstart](../README.md#quickstart) to build a typed tool and
serve it over stdio or HTTP. Install matching stable versions across Toolgrain
packages; npm's `latest` tag selects the current stable release.

## Build a server

| Guide | What you will learn |
| --- | --- |
| [Tool authoring](./tools.md) | Reusable definitions, Zod schemas, variants, rich results, errors, and handler context |
| [Transports](./transports.md) | Stdio, managed HTTP, Web/Node handlers, lifecycle, headers, and host configuration |
| [Context providers](./context.md) | Lazy dependencies, inferred accessors, request caching, and test overrides |
| [Authorization](./authorization.md) | JWT and Clerk access tokens, verified identities, metadata, and public URLs |
| [Runnable examples](../apps/README.md) | Stdio, Node HTTP, Express, Hono, Elysia, Next.js, and protected endpoints |

Start with `@toolgrain/mcp` for the authoring API. Add `@toolgrain/node` for
stdio or a Node listener, or `@toolgrain/http` for a Web handler. JWT and Clerk
are optional integrations. See the [package overview](../README.md#packages)
for individual installation guides.

## Mintlify site

The Mintlify site lives in this directory. `docs.json` defines its navigation and
Mint theme, and `assets/` contains the site's static files. The introduction and
quickstart are starter pages awaiting Toolgrain content. Existing Markdown guides
remain the current documentation on GitHub; `.mintignore` excludes them from the
site until their content and repository-relative links are adapted for Mintlify.

With the Mintlify CLI installed, run these commands from the repository root:

```sh
cd docs
mint dev
```

To validate the site and check links, run `mint validate` and `mint broken-links`
from the same directory. When configuring Mintlify's Git connection, set the
documentation subdirectory to `/docs`. Hosting configuration and deployment are
separate steps.

The starter's MIT license is preserved in [LICENSE](./LICENSE).

The site keeps Mint's original backgrounds, fonts, and component styling, with
olive and citron accents configured in `docs.json` and Toolgrain's approved
monochrome logo and favicon from `brand/`. See
[asset provenance](./assets/README.md) for artwork sources and checksums.

## Check compatibility

| Reference | Purpose |
| --- | --- |
| [Support policy](./support-policy.md) | Runtime, TypeScript, Zod, platform, and upgrade commitments |
| [Client compatibility](./compatibility.md) | Tested clients and current limitations |
| [Interoperability report](./interoperability-2026-10-22.md) | Recorded protocol and client checks |
| [Published-package verification](./rc0-acceptance-2026-10-25.md) | Stable/RC archive and consumer verification |

Current support covers tools over MCP `2026-07-28` and `2025-06-18`, using stdio
or independent HTTP POSTs with JSON responses. Resources, prompts, elicitation,
sessions, SSE, progress, and subscriptions are outside the current implementation.

## Contribute and maintain

- [Contributing](../.github/CONTRIBUTING.md): report a bug, propose a change, or open a pull request.
- [Development and verification](./development.md): setup, checks, package consumers, and CI.
- [Architecture and protocol](./architecture.md): internal boundaries and pinned upstream material.
- [Release guide](./releases.md): Changesets, Release PR review, publication, and recovery.
- [Roadmap](../ROADMAP.md): current capabilities, follow-ups, and proposals.
- [Brand assets](../brand/README.md): approved artwork, tokens, usage, and provenance.
- [Security](../.github/SECURITY.md) and [Code of Conduct](../.github/CODE_OF_CONDUCT.md): private reporting contacts.
