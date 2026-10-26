# Documentation assets

This directory contains the assets needed by the Mintlify site without access to
files outside its documentation root. The canonical Toolgrain artwork
remains in [`brand/`](../../brand/README.md).

## Artwork

`logo/light.svg` and `logo/dark.svg` are unchanged copies of the approved
`brand/logo-light.svg` and `brand/logo-dark.svg` lockups. `favicon/light.svg` and
`favicon/dark.svg` reuse the corresponding approved standalone marks. Preserve
the complete mark and wordmark proportions. Toolgrain-owned artwork follows the
repository's MIT license.

When updating artwork, copy the approved export from `brand/` and update the
checksums in `provenance.json`; do not redraw it in the site. Check the result in
both color modes.

## Site styling

The documentation uses Mint's original backgrounds, typography, spacing, and
components, with olive and citron accents configured in `docs.json`. There are
no custom stylesheets or bundled brand fonts. `provenance.json` records source
paths and SHA-256 checksums for the distributed artwork.
