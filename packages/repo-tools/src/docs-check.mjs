import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { compile, createProcessor } from "@mdx-js/mdx";
import GithubSlugger from "github-slugger";
import remarkFrontmatter from "remark-frontmatter";

const external = (url) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url);
function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}
const text = (node) =>
  node.value ?? node.alt ?? (node.children ?? []).map(text).join("");

/** Static source validation; MDX is compiled but its JavaScript is never evaluated. */
export async function checkDocs(root) {
  assert(
    globalThis.Bun?.YAML,
    "Run documentation checks with the pinned Bun runtime",
  );
  root = resolve(root);
  const errors = [];
  const pages = new Map();
  const references = [];
  const paths = readdirSync(root, { recursive: true }).filter(
    (path) =>
      path.endsWith(".mdx") &&
      !path
        .split(sep)
        .some((part) => part.startsWith(".") || part === "node_modules"),
  );
  for (const path of paths) {
    const source = readFileSync(join(root, path), "utf8");
    try {
      const options = { remarkPlugins: [remarkFrontmatter] };
      const tree = createProcessor(options).parse(source);
      const frontmatter = tree.children.find(({ type }) => type === "yaml");
      assert(frontmatter, "Missing YAML frontmatter");
      const metadata = Bun.YAML.parse(frontmatter.value);
      for (const field of ["title", "description"])
        assert(
          typeof metadata?.[field] === "string" && metadata[field].trim(),
          `Missing ${field}`,
        );
      await compile(source, options);
      const slugger = new GithubSlugger();
      const anchors = new Set();
      walk(tree, (node) => {
        if (node.type === "heading") anchors.add(slugger.slug(text(node)));
        if (["link", "image", "definition"].includes(node.type))
          references.push({ from: path, url: node.url });
        for (const attr of node.attributes ?? []) {
          if (typeof attr.value !== "string") continue;
          if (attr.name === "id" || (node.name === "a" && attr.name === "name"))
            anchors.add(attr.value);
          if (["href", "src"].includes(attr.name))
            references.push({ from: path, url: attr.value });
        }
      });
      pages.set(path.split(sep).join("/"), anchors);
    } catch (error) {
      errors.push(`${path}: ${error.message}`);
    }
  }
  if (!paths.length) errors.push("No MDX pages found");
  const navigation = new Set();
  try {
    const config = JSON.parse(readFileSync(join(root, "docs.json"), "utf8"));
    function visit(value) {
      if (!value || typeof value !== "object") return;
      for (const [key, children] of Object.entries(value)) {
        if (key === "pages" && Array.isArray(children)) {
          for (const item of children) {
            if (typeof item !== "string") continue;
            if (external(item)) continue;
            const page = `${item.replace(/^\//, "").replace(/\.mdx$/, "")}.mdx`;
            assert(
              pages.has(page),
              `Navigation points to missing page: ${item}`,
            );
            assert(!navigation.has(page), `Duplicate navigation page: ${item}`);
            navigation.add(page);
          }
        }
        visit(children);
      }
    }
    visit(config.navigation);
    assert(navigation.size > 0, "Navigation has no pages");
    for (const asset of [config.logo, config.favicon])
      for (const [key, value] of Object.entries(asset ?? {}))
        if (typeof value === "string" && ["light", "dark"].includes(key))
          references.push({ from: "docs.json", url: value });
    if (typeof config.favicon === "string")
      references.push({ from: "docs.json", url: config.favicon });
    for (const path of pages.keys())
      assert(navigation.has(path), `Page missing from navigation: ${path}`);
  } catch (error) {
    errors.push(`docs.json: ${error.message}`);
  }

  for (const { from, url } of references) {
    if (!url || external(url)) continue;
    try {
      const [pathname, fragment] = url.split("#", 2);
      const path = decodeURIComponent(pathname.split("?", 1)[0]);
      const target = path
        ? resolve(
            root,
            path.startsWith("/") ? `.${path}` : join(dirname(from), path),
          )
        : resolve(root, from);
      const local = relative(root, target);
      assert(
        !isAbsolute(local) && local !== ".." && !local.startsWith(`..${sep}`),
        "Link leaves the documentation root",
      );
      const candidate = path === "/" ? "index.mdx" : local.split(sep).join("/");
      const page = [
        candidate,
        `${candidate}.mdx`,
        `${candidate}/index.mdx`,
      ].find((p) => pages.has(p));
      if (page) {
        if (fragment)
          assert(
            pages.get(page).has(decodeURIComponent(fragment)),
            "Missing heading or explicit anchor",
          );
      } else
        assert(
          extname(target) && existsSync(target) && statSync(target).isFile(),
          "Missing local page or asset",
        );
    } catch (error) {
      errors.push(`${from}: ${url}: ${error.message}`);
    }
  }
  return {
    pages: pages.size,
    links: references.filter(({ url }) => url && !external(url)).length,
    externalLinks: references.filter(({ url }) => url && external(url)).length,
    errors,
  };
}

export async function main() {
  const result = await checkDocs(
    fileURLToPath(new URL("../../../docs/", import.meta.url)),
  );
  for (const error of result.errors) console.error(error);
  assert.equal(result.errors.length, 0, "Documentation source checks failed");
  console.log(
    `Documentation source checks passed: ${result.pages} pages, ${result.links} local links/assets. ${result.externalLinks} external URLs were not fetched; rendered layout requires separate review.`,
  );
}
