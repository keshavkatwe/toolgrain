import { readFile } from "node:fs/promises";
import { createServer, resource } from "@toolgrain/mcp";
import { APPS_MIME_TYPE } from "@toolgrain/protocol/apps";
import { tools } from "./tools.js";

export function server() {
  return createServer({
    name: "react-apps-demo",
    version: "1.0.0",
    tools,
    resources: ["weather", "sales", "shared"].map((view) =>
      resource({
        uri: `ui://demo/${view}.html`,
        name: `${view}-widget`,
        mimeType: APPS_MIME_TYPE,
        read: async (uri) => ({
          contents: [
            {
              uri,
              mimeType: APPS_MIME_TYPE,
              text: await readFile(
                new URL(`../dist/widgets/${view}.html`, import.meta.url),
                "utf8",
              ),
              _meta: {
                ui: {
                  csp: { connectDomains: [], resourceDomains: [] },
                  prefersBorder: true,
                },
              },
            },
          ],
        }),
      }),
    ),
  });
}
