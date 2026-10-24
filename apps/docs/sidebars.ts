import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "introduction",
    {
      type: "category",
      label: "Start here",
      collapsed: false,
      items: [
        "getting-started/installation",
        "getting-started/stdio",
        "getting-started/clients",
        "getting-started/http",
      ],
    },
    {
      type: "category",
      label: "Writing tools",
      items: [
        "tools/definitions",
        "tools/validation",
        "tools/results",
        "tools/errors",
      ],
    },
    {
      type: "category",
      label: "Context and services",
      items: [
        "guides/request-context",
        "guides/cancellation",
        "guides/context",
      ],
    },
    {
      type: "category",
      label: "Serving and integrating",
      items: [
        "transports/stdio",
        "transports/http",
        "transports/frameworks",
        "transports/custom",
      ],
    },
    {
      type: "category",
      label: "Authentication",
      items: [
        "authentication/overview",
        "authentication/jwt",
        "authentication/clerk",
        "guides/authorization",
      ],
    },
    {
      type: "category",
      label: "Testing and operations",
      items: ["guides/testing", "guides/production", "guides/troubleshooting"],
    },
    "examples",
    {
      type: "category",
      label: "Compatibility",
      items: [
        "compatibility/overview",
        "compatibility/clients",
        "compatibility/protocol",
      ],
    },
    {
      type: "category",
      label: "API reference",
      items: [
        "reference/mcp",
        "reference/context",
        "reference/auth",
        "reference/node",
        "reference/http",
        "reference/jwt",
        "reference/clerk",
        "reference/protocol",
      ],
    },
    {
      type: "category",
      label: "Project",
      items: [
        "project/contributing",
        "project/support-policy",
        "project/releases",
        "project/changelog",
        "project/licensing",
      ],
    },
  ],
};
export default sidebars;
