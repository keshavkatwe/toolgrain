# Toolgrain documentation instructions

Follow the repository's root `AGENTS.md` for product contracts, branches, commits,
verification, and release rules. These instructions apply to documentation work.

## Site and content

- The Mintlify site lives in `docs/`, with navigation in `docs.json`. Keep the
  user-selected Mint theme. Preview and validate from this directory.
- MDX site pages use YAML frontmatter and are the guide sources. Root Markdown
  forwarding pages preserve previous GitHub URLs and section anchors; they are
  excluded by `.mintignore`. Update the linked MDX guide, avoiding parallel copies.
- Navigation separates Guides, API reference, and Project. Keep the
  quickstart's install, compile, and Inspector flow runnable against the published
  packages. Recheck its commands and expected output when changing the example.
- Follow the root README's installation convention: omit Toolgrain package version
  pins so npm's `latest` tag selects stable releases. Remind readers to use matching
  Toolgrain versions. Preserve runtime/peer minimums and exact versions in dated
  verification evidence and historical release records.
- Document implemented APIs and verified compatibility. Clearly identify proposals
  and limitations. Check examples against the packages and support policy.
- The documentation directory is the site root. Keep site links and assets within
  it, or use explicit public GitHub URLs for repository files outside it.

## Brand and writing

- Use **Toolgrain** in prose, `toolgrain` in the approved wordmark, and exact
  `@toolgrain/*` names for packages. Describe Toolgrain as a TypeScript toolkit for
  building MCP servers with reusable, typed tools.
- Reuse approved artwork from `brand/`. Site exports live in `docs/assets/`;
  preserve their source provenance when updating them.
- Keep Mint's original backgrounds, typography, spacing, and component styling,
  with Toolgrain's documentation lockups and project links. The logo places the
  existing mark on a rounded citron tile, with an obsidian wordmark in light mode
  and an ivory wordmark in dark mode. Reuse `brand/logo-site-light.svg` and
  `brand/logo-site-dark.svg`. The accent palette is olive `#657018` for light-mode
  emphasis and buttons, and citron `#E4EE85` for dark-mode emphasis. Configure
  these through `docs.json`; do not introduce page background or font overrides.
  Articles remain static, and the mode toggle remains available.
- Use active voice, second person, concise sentences, and sentence case headings.
  Use code formatting for commands, paths, package names, and API identifiers.
- Link ordinary support to GitHub issues. Private security reports follow the
  repository's security policy. Do not invent social accounts or product links.

## Verification

Run `mint validate` and `mint broken-links` from `docs/`, then `bun run check` from
the repository root. Review visual changes in light and dark mode and at a narrow
viewport. Local preview does not authorize deployment or account changes.
