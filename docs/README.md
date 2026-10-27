# Toolgrain documentation

Read the published guides at [toolgrain.mintlify.site](https://toolgrain.mintlify.site/).

Start with the [quickstart](https://toolgrain.mintlify.site/quickstart) to build a typed tool and
serve it over stdio or HTTP. Install matching stable versions across Toolgrain
packages; npm's `latest` tag selects the current stable release.

## Build a server

| Guide | What you will learn |
| --- | --- |
| [Tool authoring](https://toolgrain.mintlify.site/tools/overview) | Reusable definitions, Zod schemas, variants, rich results, errors, and handler context |
| [Transports](https://toolgrain.mintlify.site/transports/overview) | Stdio, managed HTTP, Web/Node handlers, lifecycle, headers, and host configuration |
| [Context providers](https://toolgrain.mintlify.site/guides/context) | Lazy dependencies, inferred accessors, request caching, and test overrides |
| [Authorization](https://toolgrain.mintlify.site/guides/authorization) | JWT and Clerk access tokens, verified identities, metadata, and public URLs |
| [Runnable examples](https://toolgrain.mintlify.site/examples) | Stdio, Node HTTP, Express, Hono, Elysia, Next.js, and protected endpoints |

Start with `@toolgrain/mcp` for the authoring API. Add `@toolgrain/node` for
stdio or a Node listener, or `@toolgrain/http` for a Web handler. JWT and Clerk
are optional integrations. See the [package overview](../README.md#packages)
for individual installation guides.

## Mintlify site

The Mintlify site lives in this directory. `docs.json` defines its navigation and
Mint theme, and `assets/` contains the site's static files. Start with the
[introduction](./index.mdx) and [quickstart](./quickstart.mdx). The site includes
getting started, tools, context, transports, authorization, testing, compatibility,
API reference, and project guides. Edit the MDX pages as the source of truth.
Root Markdown forwarding pages retain older GitHub guide URLs and section
anchors; `.mintignore` excludes them from the site.

The Guides tab covers application development. API reference documents all six
published libraries and shared contracts. Project contains contribution,
development, support, licensing, and current release guidance. Compatibility
reports keep their original dates and verification limits.

With the Mintlify CLI installed, run these commands from the repository root:

```sh
cd docs
mint dev
```

To validate the site and check links, run `mint validate` and `mint broken-links`
from the same directory. When configuring Mintlify's Git connection, set the
documentation subdirectory to `/docs`. The published site is
[toolgrain.mintlify.site](https://toolgrain.mintlify.site/).

For a fast source check with the repository's pinned dependencies, run
`bun run test:docs` from the repository root. It checks MDX syntax, required
frontmatter, navigation coverage, literal local links/anchors, and assets without
evaluating page JavaScript. CI uses this check for site and artwork changes.
It does not replace Mintlify's rendered build, external-link checks, example
execution, or visual review.

The starter's MIT license and Mintlify attribution are preserved in
[third-party notices](./notices/mintlify-starter.txt). Toolgrain's license is in
the repository's [root LICENSE](../LICENSE).

The site keeps Mint's original backgrounds, fonts, and component styling, with
olive and citron accents configured in `docs.json`. Toolgrain's documentation
logo places its mark on a rounded citron tile; the favicon uses the monochrome
mark. Both come from `brand/`. See
[asset provenance](./assets/README.md) for artwork sources and checksums.

## Check compatibility

| Reference | Purpose |
| --- | --- |
| [Support policy](https://toolgrain.mintlify.site/project/support-policy) | Runtime, TypeScript, Zod, platform, and upgrade commitments |
| [Client compatibility](https://toolgrain.mintlify.site/compatibility/protocol) | Tested clients and current limitations |
| [Interoperability report](https://toolgrain.mintlify.site/compatibility/clients) | Recorded protocol and client checks |
| [Published-package verification](https://toolgrain.mintlify.site/compatibility/published-packages) | Stable/RC archive and consumer verification |

Current support covers tools over MCP `2026-07-28` and `2025-06-18`, using stdio
or independent HTTP POSTs with JSON responses. Resources, prompts, elicitation,
sessions, SSE, progress, and subscriptions are outside the current implementation.

## Contribute and maintain

- [Contributing](../.github/CONTRIBUTING.md): report a bug, propose a change, or open a pull request.
- [Development and verification](https://toolgrain.mintlify.site/project/development): setup, checks, package consumers, and CI.
- [Architecture and protocol](https://toolgrain.mintlify.site/project/architecture): internal boundaries and pinned upstream material.
- [Release guide](https://toolgrain.mintlify.site/project/releases): Changesets, Release PR review, publication, and recovery.
- [Roadmap](../ROADMAP.md): current capabilities, follow-ups, and proposals.
- [Brand assets](../brand/README.md): approved artwork, tokens, usage, and provenance.
- [Security](../.github/SECURITY.md) and [Code of Conduct](../.github/CODE_OF_CONDUCT.md): private reporting contacts.
