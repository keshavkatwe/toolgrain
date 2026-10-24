# Toolgrain documentation

The Docusaurus site implements the approved Monolith design with shared assets
from `brand/`, continuous hero motion, and local documentation search.

From the repository root:

```sh
bun install --frozen-lockfile
bun run --cwd apps/docs dev
```

Open http://localhost:3010/toolgrain/. For a production preview:

```sh
bun run --cwd apps/docs typecheck
bun run --cwd apps/docs build
bun run --cwd apps/docs serve --port 3010
```

The production build fails on broken internal links and anchors. Run the root
Biome check before submitting changes. This workspace is private and is excluded
from library release versioning.

## Content and shared sources

Edit authored pages in `docs/` and navigation in `sidebars.ts`. API examples must
match the current packages; distinguish unpublished consumer instructions from
commands that work inside this repository.

`prepare:site` runs automatically before development, builds, and type checks.
It copies the approved SVG assets and licensed Manrope font, generates brand
variables and the local search index, and imports these canonical root sources:

| Root source | Generated site page |
| --- | --- |
| `docs/context.md` | `docs/guides/context.md` |
| `docs/authorization.md` | `docs/guides/authorization.md` |
| `docs/compatibility.md` | `docs/compatibility/protocol.md` |
| `docs/interoperability-2026-10-22.md` | `docs/compatibility/clients.md` |
| `docs/support-policy.md` | `docs/project/support-policy.md` |
| `docs/releases.md` | `docs/project/releases.md` |
| `CHANGELOG.md` | `docs/project/changelog.md` |

Generated files are ignored. Edit their root sources, then rerun `prepare:site`
(or restart development) to refresh them. Other Markdown edits are watched by
Docusaurus; restart development to refresh search after adding or editing pages.
Search runs locally in the browser without a hosted service.

## Design and motion

`brand/brand.json` supplies the shared palette and motion timing. Hero artwork
lives in `src/components/MonolithHero/`; shared signal ribbons and page motion
controls live in `src/components/MotionField/`. The compact sticky header is shared across the site. Docs use a chapter index,
mobile contents control, and a compact branded footer. The DocRoot integration
keeps Docusaurus routing and TOC behavior; when upgrading Docusaurus, recheck
the sidebar viewport selectors and anchor offsets. Footer
and body motion share Pause with the hero, respect reduced motion, and stop
canvas rendering while offscreen or hidden. Foreground rendering is capped at
60 fps and the slow hero atmosphere at 30 fps, with a 1× canvas pixel ratio.
Ribbon buffers and light sprites are reused; the metallic footer sweep uses
a transform instead of repainting its gradient. Preserve these rendering
budgets when changing motion. These reduce rendering work; they are not a
measured battery-life or temperature guarantee. Docs articles remain static. Preserve
Pause, reduced-motion behavior, offscreen and hidden-tab suspension, and the SVG
fallback when WebGL is unavailable. Manrope's license and font provenance are
copied into the built site alongside the font.

## Hosting

The configured GitHub Pages URL is `https://keshavkatwe.github.io/toolgrain/`.
Assets and internal links respect the `/toolgrain/` base path. `build/` contains
the static output and `.nojekyll` marker. Deployment is a separate, explicitly
authorized step; building the site does not publish it.
