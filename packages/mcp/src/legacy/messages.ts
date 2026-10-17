import { z } from "zod";
import { object } from "../protocol/messages.js";

export const commonParams = z.looseObject({
  _meta: object.optional(),
});
export const initializeParams = commonParams.extend({
  protocolVersion: z.string(),
  capabilities: z.looseObject({
    experimental: z.record(z.string(), object).optional(),
    roots: z.looseObject({ listChanged: z.boolean().optional() }).optional(),
    sampling: object.optional(),
    elicitation: object.optional(),
  }),
  clientInfo: z.looseObject({
    name: z.string(),
    version: z.string(),
    title: z.string().optional(),
  }),
});
export const listParams = commonParams.extend({
  cursor: z.string().optional(),
});
export const callParams = commonParams.extend({
  name: z.string(),
  arguments: object.optional(),
});
