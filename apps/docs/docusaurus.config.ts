import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes } from "prism-react-renderer";

const config: Config = {
  title: "Toolgrain",
  tagline: "Less ceremony. More capability.",
  favicon: "brand/mark-light.svg",
  url: "https://keshavkatwe.github.io",
  baseUrl: "/toolgrain/",
  organizationName: "keshavkatwe",
  projectName: "toolgrain",
  trailingSlash: true,
  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  markdown: { hooks: { onBrokenMarkdownLinks: "throw" } },
  future: { v4: true },
  i18n: { defaultLocale: "en", locales: ["en"] },
  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: ({ docPath }) => {
            const canonical: Record<string, string> = {
              "guides/context.md": "docs/context.md",
              "guides/authorization.md": "docs/authorization.md",
              "compatibility/protocol.md": "docs/compatibility.md",
              "compatibility/clients.md": "docs/interoperability-2026-10-22.md",
              "project/support-policy.md": "docs/support-policy.md",
              "project/releases.md": "docs/releases.md",
              "project/changelog.md": "CHANGELOG.md",
            };
            return `https://github.com/keshavkatwe/toolgrain/edit/main/${canonical[docPath] ?? `apps/docs/docs/${docPath}`}`;
          },
          showLastUpdateTime: false,
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    metadata: [{ name: "theme-color", content: "#101214" }],
    announcementBar: {
      id: "unpublished-0-1-0",
      content: "Toolgrain 0.1.0 · In development · Packages unpublished.",
      isCloseable: false,
    },
    colorMode: { defaultMode: "dark", respectPrefersColorScheme: false },
    navbar: {
      logo: {
        alt: "Toolgrain",
        src: "brand/logo-light.svg",
        srcDark: "brand/logo-dark.svg",
        width: 152,
        height: 36,
      },
      items: [
        {
          to: "/docs/introduction",
          label: "Docs",
          position: "right",
          activeBaseRegex: "/docs/",
        },
        { to: "/docs/examples", label: "Examples", position: "right" },
        {
          href: "https://github.com/keshavkatwe/toolgrain",
          label: "GitHub",
          position: "right",
        },
        { type: "search", position: "right" },
      ],
    },
    docs: { sidebar: { hideable: false, autoCollapseCategories: true } },
    prism: {
      theme: themes.github,
      darkTheme: themes.vsDark,
      additionalLanguages: ["bash", "json", "toml"],
    },
  } satisfies Preset.ThemeConfig,
};
export default config;
