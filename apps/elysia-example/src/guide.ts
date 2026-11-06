import { resource } from "@toolgrain/mcp";

export const guide = resource({
  uri: "docs://elysia/guide",
  name: "elysia-guide",
  title: "Elysia example guide",
  description: "Read the example's usage notes through MCP.",
  mimeType: "text/markdown",
  read: (uri) => ({
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text: "# Elysia example\n\nCall greet with a name, or read this guide through resources/read.",
      },
    ],
  }),
});
