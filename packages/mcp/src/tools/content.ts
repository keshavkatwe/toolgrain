import { z } from "zod";
import { icon } from "../protocol/icon.js";
import { object } from "../protocol/messages.js";

const annotations = z.looseObject({
  audience: z.array(z.enum(["user", "assistant"])).optional(),
  priority: z.number().min(0).max(1).optional(),
  lastModified: z.string().optional(),
});

const common = z.looseObject({
  annotations: annotations.optional(),
  _meta: object.optional(),
});
const resourceContents = z.looseObject({
  uri: z.string(),
  mimeType: z.string().optional(),
  _meta: object.optional(),
});

export const contentBlock = z.discriminatedUnion("type", [
  common.extend({ type: z.literal("text"), text: z.string() }),
  common.extend({
    type: z.literal("image"),
    data: z.string(),
    mimeType: z.string(),
  }),
  common.extend({
    type: z.literal("audio"),
    data: z.string(),
    mimeType: z.string(),
  }),
  common.extend({
    type: z.literal("resource_link"),
    uri: z.string(),
    name: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    size: z.number().optional(),
    icons: z.array(icon).optional(),
  }),
  common.extend({
    type: z.literal("resource"),
    resource: z.union([
      resourceContents.extend({ text: z.string() }),
      resourceContents.extend({ blob: z.string() }),
    ]),
  }),
]);

export const explicitResult = z.strictObject({
  content: z.array(contentBlock),
  structuredContent: z.unknown().optional(),
  isError: z.boolean().optional(),
  _meta: object.optional(),
});
