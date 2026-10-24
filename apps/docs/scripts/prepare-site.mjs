import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(site, "../..");
async function writeChanged(filename, value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    if (data.equals(await readFile(filename))) return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = `${filename}.${randomUUID()}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, filename);
}
const brand = JSON.parse(
  await readFile(path.join(root, "brand/brand.json"), "utf8"),
);
for (const dir of [
  "static/brand",
  "static/fonts",
  "src/generated",
  "docs/guides",
  "docs/compatibility",
  "docs/project",
])
  await mkdir(path.join(site, dir), { recursive: true });

for (const name of [
  "logo-dark.svg",
  "logo-light.svg",
  "mark-dark.svg",
  "mark-light.svg",
  "wordmark-dark.svg",
  "wordmark-light.svg",
  "brand-sheet.svg",
  "brand.json",
])
  await writeChanged(
    path.join(site, "static/brand", name),
    await readFile(path.join(root, "brand", name)),
  );
for (const [source, target] of [
  ["Manrope.ttf", "Manrope.ttf"],
  ["OFL.txt", "OFL.txt"],
  ["FONTLOG.txt", "FONTLOG.txt"],
])
  await writeChanged(
    path.join(site, "static/fonts", target),
    await readFile(path.join(root, "brand/source", source)),
  );
await writeChanged(
  path.join(site, "src/generated/brand.css"),
  `/* Generated from brand/brand.json. */\n:root {\n${Object.entries(
    brand.colors,
  )
    .map(([key, value]) => `  --tg-${key}: ${value};`)
    .join("\n")}\n}\n`,
);

const guides = [
  ["docs/context.md", "guides/context.md"],
  ["docs/authorization.md", "guides/authorization.md"],
  ["docs/compatibility.md", "compatibility/protocol.md"],
  ["docs/interoperability-2026-10-22.md", "compatibility/clients.md"],
  ["docs/support-policy.md", "project/support-policy.md"],
  ["docs/releases.md", "project/releases.md"],
  ["CHANGELOG.md", "project/changelog.md"],
];
const mapped = new Map(guides.map(([source, target]) => [source, target]));
for (const [source, target] of guides) {
  let text = await readFile(path.join(root, source), "utf8");
  text = text.replace(/\]\(([^)]+)\)/g, (match, href) => {
    if (/^(?:https?:|#|mailto:)/.test(href)) return match;
    const [file, anchor] = href.split("#");
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(source), file),
    );
    const destination = mapped.get(resolved);
    const url = destination
      ? path.posix.relative(path.posix.dirname(target), destination)
      : `https://github.com/keshavkatwe/toolgrain/blob/main/${resolved}`;
    return `](${url}${anchor ? `#${anchor}` : ""})`;
  });
  await writeChanged(path.join(site, "docs", target), text);
}

// A small static index: all documentation text is searchable without a service.
const index = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(filename);
    else if (/\.mdx?$/.test(entry.name)) {
      const source = await readFile(filename, "utf8");
      const title =
        source.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] ??
        source.match(/^#\s+(.+)$/m)?.[1] ??
        entry.name;
      const content = source
        .replace(/^---\n[\s\S]*?\n---\n/, "")
        .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[#*_`|]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      index.push({
        title,
        path: `/docs/${path
          .relative(path.join(site, "docs"), filename)
          .replace(/\\/g, "/")
          .replace(/\.mdx?$/, "")}`,
        content,
      });
    }
  }
}
await visit(path.join(site, "docs"));
index.sort((a, b) => a.path.localeCompare(b.path));
await writeChanged(
  path.join(site, "src/generated/search-index.json"),
  `${JSON.stringify(index)}\n`,
);
await writeChanged(
  path.join(site, "src/generated/motion.json"),
  `${JSON.stringify(brand.motion)}\n`,
);
console.log(
  `Prepared shared brand assets, ${guides.length} canonical guides, and ${index.length} searchable pages.`,
);
