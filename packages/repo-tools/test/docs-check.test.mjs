import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkDocs } from "../src/docs-check.mjs";

const page = (body) =>
  `---\ntitle: "Guide"\ndescription: "An example guide"\n---\n\n${body}\n`;
async function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "toolgrain-docs-check-"));
  const write = (path, value) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(
      join(root, path),
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  const config = {
    navigation: {
      tabs: [
        {
          tab: "Guides",
          groups: [{ group: "Start", pages: ["index", "guide"] }],
        },
      ],
    },
    logo: { light: "/assets/logo.svg", dark: "/assets/logo.svg" },
    favicon: { light: "/assets/logo.svg", dark: "/assets/logo.svg" },
  };
  try {
    write("docs.json", config);
    write("assets/logo.svg", "<svg/>");
    write(
      "index.mdx",
      page(
        '[Read more](/guide#using-foo)\n\n<Card href="/guide#using-foo">Guide</Card>\n\n<img src="/assets/logo.svg" />\n\n[External](https://offline.invalid)',
      ),
    );
    write(
      "guide.mdx",
      page(
        '## Using `foo`\n\n[Home](/)\n\nexport const neverRun = (() => { throw new Error("MDX evaluated"); })();',
      ),
    );
    await run({ root, write, config });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("fast documentation checks compile MDX without executing it and resolve local routes, anchors and assets", async () => {
  await fixture(async ({ root }) => {
    const report = await checkDocs(root);
    assert.equal(report.pages, 2);
    assert.deepEqual(report.errors, []);
    assert(report.links >= 8);
  });
});

test("broken MDX, frontmatter, local links and assets fail source checks", async () => {
  for (const body of [
    "<Card>unclosed",
    "[Missing](/absent)",
    "[Missing heading](/guide#absent)",
    '<img src="/assets/missing.svg" />',
    "[Escape](../../outside.md)",
  ]) {
    await fixture(async ({ root, write }) => {
      write("index.mdx", page(body));
      assert((await checkDocs(root)).errors.length > 0, body);
    });
  }
  await fixture(async ({ root, write }) => {
    write("guide.mdx", "---\ntitle: Guide\n---\nText");
    assert(
      (await checkDocs(root)).errors.some((error) =>
        error.includes("Missing description"),
      ),
    );
  });
});

test("navigation rejects missing, duplicate and unlisted pages and checks each configured asset", async () => {
  for (const pages of [
    ["index", "missing"],
    ["index", "guide", "guide"],
    ["index"],
  ]) {
    await fixture(async ({ root, write, config }) => {
      config.navigation.tabs[0].groups[0].pages = pages;
      write("docs.json", config);
      assert((await checkDocs(root)).errors.length > 0);
    });
  }
  await fixture(async ({ root, write, config }) => {
    config.logo.light = "/missing-logo.svg";
    write("docs.json", config);
    assert(
      (await checkDocs(root)).errors.some((error) =>
        error.includes("missing-logo.svg"),
      ),
    );
  });
});
