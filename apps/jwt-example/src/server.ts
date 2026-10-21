import { jwt } from "@toolgrain/jwt";
import { createServer } from "@toolgrain/mcp";
import { whoAmI } from "./who-am-i.js";

export const server = createServer({
  name: "jwt-example",
  version: "1.0.0",
  auth: jwt({
    // Set JWT_ISSUER to your provider; the default is a documentation placeholder.
    issuer: process.env.JWT_ISSUER ?? "https://auth.example.com",
    ...(process.env.MCP_RESOURCE ? { resource: process.env.MCP_RESOURCE } : {}),
  }),
  tools: { whoAmI },
});
