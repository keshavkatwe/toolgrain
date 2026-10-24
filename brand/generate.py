"""Regenerate portable SVG artwork. Requires fonttools==4.60.1 (build-only)."""

import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree as ET

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent
NS = "{http://www.w3.org/2000/svg}"
brand = json.loads((ROOT / "brand.json").read_text())
source = ROOT / brand["fontSource"]["localPath"]
font = instantiateVariableFont(TTFont(source), {"wght": 800}, inplace=False)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
units = font["head"].unitsPerEm
scale = 64 / units
tracking = brand["typography"]["wordmark"]["trackingEm"] * units
path_pen = SVGPathPen(glyphs)
bounds_pen = BoundsPen(glyphs)
x = 0
for char in brand["wordmark"]:
    glyph = glyphs[cmap[ord(char)]]
    transform = (scale, 0, 0, -scale, x * scale, 0)
    glyph.draw(TransformPen(path_pen, transform))
    glyph.draw(TransformPen(bounds_pen, transform))
    x += glyph.width + tracking
x0, y0, x1, y1 = bounds_pen.bounds
word_width, word_height = x1 - x0, y1 - y0
word_paths = path_pen.getCommands()
mark_tree = ET.parse(ROOT / "mark.svg").getroot()
mark_parts = []
for child in mark_tree:
    tag = child.tag.removeprefix(NS)
    if tag in ("path", "circle"):
        attrs = " ".join(f'{k}="{v}"' for k, v in child.attrib.items())
        mark_parts.append(f"<{tag} {attrs}/>")
mark_paths = "".join(mark_parts)


def svg(width, height, content, fill, label):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.3f} {height:.3f}" '
        f'width="{width:.3f}" height="{height:.3f}" fill="{fill}" '
        f'role="img" aria-label="{label}">\n  {content}\n</svg>\n'
    )


variants = {"": "currentColor", "-dark": brand["colors"]["ivory"], "-light": brand["colors"]["obsidian"]}
for suffix, color in variants.items():
    word = f'<g transform="translate({8-x0:.3f} {8-y0:.3f})"><path d="{word_paths}"/></g>'
    (ROOT / f"wordmark{suffix}.svg").write_text(svg(word_width + 16, word_height + 16, word, color, "Toolgrain"))
    if suffix:
        (ROOT / f"mark{suffix}.svg").write_text(svg(96, 112, mark_paths, color, "Toolgrain mark"))
    mark_scale = 0.61
    lockup_height = 84
    word_x = 80
    content = (
        f'<g transform="translate(4 7.84) scale({mark_scale})">{mark_paths}</g>'
        f'<g transform="translate({word_x-x0:.3f} {(lockup_height-word_height)/2-y0:.3f})">'
        f'<path d="{word_paths}"/></g>'
    )
    (ROOT / f"logo{suffix}.svg").write_text(svg(word_width + word_x + 10, lockup_height, content, color, "Toolgrain"))

sheet_width, sheet_height = 1200, 860
lockup = f'<g transform="translate(0 7.84) scale({mark_scale})">{mark_paths}</g><g transform="translate({word_x-x0:.3f} {(lockup_height-word_height)/2-y0:.3f})"><path d="{word_paths}"/></g>'
swatches = []
for index, (name, color) in enumerate(brand["colors"].items()):
    swatch_x = 64 + index * 180
    swatches.append(
        f'<rect x="{swatch_x}" y="574" width="155" height="70" rx="4" fill="{color}" stroke="#41484a"/>'
        f'<text x="{swatch_x}" y="674" fill="#f6f4ee" font-size="15">{name.capitalize()}</text>'
        f'<text x="{swatch_x}" y="699" fill="#9fa9aa" font-family="monospace" font-size="13">{color}</text>'
    )
sheet = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 860" width="1200" height="860" role="img" aria-label="Toolgrain Monolith brand sheet">'
    '<rect width="1200" height="860" fill="#101214"/>'
    '<g font-family="Arial, Helvetica, sans-serif">'
    '<text x="64" y="62" fill="#a4a9aa" font-family="monospace" font-size="12" letter-spacing="3">TOOLGRAIN / MONOLITH</text>'
    '<text x="64" y="111" fill="#f6f4ee" font-size="32" font-weight="600">One identity. Everywhere you build.</text>'
    '<text x="1136" y="61" fill="#e4ee85" font-size="12" text-anchor="end">APPROVED BRAND IDENTITY</text>'
    '<line x1="64" y1="143" x2="1136" y2="143" stroke="#303739"/>'
    f'<g transform="translate(66 205) scale(1.65)" fill="#f6f4ee">{lockup}</g>'
    f'<g transform="translate(988 189) scale(1.2)" fill="#e4ee85">{mark_paths}</g>'
    '<text x="64" y="376" fill="#a4a9aa" font-size="12">Primary lockup · outlined SVG · transparent background</text>'
    '<rect x="64" y="408" width="682" height="114" rx="4" fill="#f6f4ee"/>'
    f'<g transform="translate(91 425) scale(.9)" fill="#101214">{lockup}</g>'
    '<text x="796" y="435" fill="#f6f4ee" font-size="20" font-weight="600">Less ceremony.</text>'
    '<text x="796" y="464" fill="#f6f4ee" font-size="20" font-weight="600">More capability.</text>'
    '<text x="796" y="503" fill="#a4a9aa" font-size="12">Manrope / geometric / precise</text>'
    + "".join(swatches)
    + '<line x1="64" y1="741" x2="1136" y2="741" stroke="#303739"/>'
    '<text x="64" y="782" fill="#a4a9aa" font-size="13">Display: Manrope 800 · Body: Manrope 400 · Code: DM Mono</text>'
    '<text x="64" y="813" fill="#a4a9aa" font-size="12">Flat core artwork / Metallic presentation / Citron for active moments</text>'
    '<text x="1136" y="813" fill="#a4a9aa" font-size="12" text-anchor="end">toolgrain · 2026</text>'
    '</g></svg>\n'
)
(ROOT / "brand-sheet.svg").write_text(sheet)

manifest = {
    "fontSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "generator": "fonttools 4.60.1",
    "wordmark": "Outlined Manrope ExtraBold, 800 weight, -0.045em tracking",
    "files": {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(ROOT.glob("*.svg"))
    },
}
(ROOT / "provenance.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Generated {len(manifest['files'])} SVG assets; all wordmarks are outlined.")
