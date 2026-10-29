import { type JwtClaims, jwt, useAuth } from "@toolgrain/jwt";
import { createServer, tool } from "@toolgrain/mcp";
import { z } from "zod";

const who = tool({
  input: z.object({}),
  execute(_input, ctx) {
    const claims: JwtClaims = useAuth(ctx).claims;
    const issuer: string = claims.iss;
    const subject: string | undefined = claims.sub;
    const custom: unknown = claims.custom;
    void custom;
    return { issuer, subject: subject ?? null };
  },
});
const server = createServer({
  name: "jwt",
  version: "1",
  tools: { who },
  auth: jwt({
    issuer: "https://auth.example.com",
    scopesSupported: ["tools:read"] as const,
  }),
});
await server.close();
