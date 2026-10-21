import { useAuth } from "@toolgrain/clerk";
import { tool } from "@toolgrain/mcp";
import { z } from "zod";

export const whoAmI = tool({
  title: "Authenticated caller",
  description: "Show the Clerk OAuth identity verified for this request",
  annotations: { readOnlyHint: true, openWorldHint: false },
  input: z.object({}),
  output: z.object({
    userId: z.string(),
    clientId: z.string(),
    scopes: z.array(z.string()),
  }),
  execute(_input, ctx) {
    const { userId, clientId, scopes } = useAuth(ctx);
    return { userId, clientId, scopes: [...scopes] };
  },
});
