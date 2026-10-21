import { useAuth } from "@toolgrain/jwt";
import { tool } from "@toolgrain/mcp";
import { z } from "zod";

export const whoAmI = tool({
  description: "Describe the authenticated caller",
  annotations: { readOnlyHint: true },
  input: z.object({}),
  execute(_input, ctx) {
    const { claims } = useAuth(ctx);
    return {
      subject: claims.sub ?? null,
      issuer: claims.iss,
      expiresAt: claims.exp,
    };
  },
});
