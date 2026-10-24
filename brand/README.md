# Toolgrain brand assets

Approved on 2026-10-23: the Monolith visual direction, continuous restrained
motion, logo mark, wordmark, and lockup. This directory is the shared source for
Toolgrain brand artwork and design tokens. Reuse these assets in future work
instead of recreating the logo. Broad rollout and publication remain separate work.

## Artwork

| File | Use |
| --- | --- |
| `logo-dark.svg` | Mark and wordmark on dark backgrounds |
| `logo-light.svg` | Mark and wordmark on light backgrounds |
| `logo.svg` | Inline SVG inheriting the surrounding CSS color |
| `wordmark-dark.svg`, `wordmark-light.svg` | Wordmark without the mark |
| `mark-dark.svg`, `mark-light.svg` | Standalone mark |
| `mark.svg` | Editable mark source; inherits CSS color when inlined |
| `brand-sheet.svg` | Self-contained visual brand reference |
| `brand.json` | Shared colors, typography, artwork locations, and motion tokens |

The lockup and wordmark use outlined paths, with no font installation or network
dependency. SVGs have transparent backgrounds. Use the fixed-color variants in
image tags and design applications; use the `currentColor` variants when inlining
the SVG in an application. Choose one high-contrast color for the core logo.

The mark echoes the hero's monolithic routing junction. Its separate circular
grain can become the moving request in larger brand presentations. The metallic
hero is a presentation treatment, not a replacement for the core flat logo.

## Usage

Use **Toolgrain** in prose and **toolgrain** in the wordmark. Keep at least one
mark-stem width of clear space. Use the complete lockup at 132px wide or larger
and the standalone mark at 24px high or larger. Below that, simplify the mark
for a dedicated small-size asset rather than squeezing the full lockup.

Keep proportions intact. Do not retype, stretch, recolor individual letters,
or add effects to the core logo. Use ivory on obsidian and obsidian on light
surfaces. Citron is an accent for links, active states, and request motion.

Display typography uses Manrope ExtraBold; body text uses Manrope Regular.
Code uses DM Mono with a system monospace fallback. Only Manrope's source is
included here; a website implementation must separately obtain and preserve
the license for any other font it distributes.

## Motion

The landing hero repeats a seamless 6.5-second call sequence with no automatic
rest or held stage. Signals travel continuously, fading gently at route ends;
sculpture movement stays small and smoothly periodic. Footer ribbons and the
metallic wordmark also flow continuously. The manual Pause control stops the
timeline; hidden documents pause without catching up when restored.
Reduced motion shows a complete static scene. Documentation articles stay still.

The approved interactive design reference is `design/monolith-preview.html` at
the repository root. It is a standalone design prototype, not a production
Docusaurus implementation.

## Regeneration and provenance

`mark.svg` and `brand.json` are editable sources. The outlined wordmark comes
from the pinned, unmodified Manrope source in `source/`. Regenerate the derived
SVGs with Python and `fonttools==4.60.1`:

```sh
python3 brand/generate.py
```

FontTools is a build-only requirement, not a Toolgrain library dependency.
`provenance.json` records source and generated-file checksums. The upstream
font commit is recorded in `brand.json`; preserve the accompanying OFL and
FONTLOG files when redistributing the font. The font remains under its original
SIL Open Font License. Toolgrain-owned artwork follows the repository MIT license.

The font's upstream [license](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt)
and [source](https://github.com/aaronbell/manrope/tree/6f81ebecdf65e4463b798cc07b16a4f8d5216917)
are retained for reference.
