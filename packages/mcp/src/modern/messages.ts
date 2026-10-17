import { z } from "zod";
import { object } from "../protocol/messages.js";
import { metadata } from "./metadata.js";

export const commonParams = z.looseObject({ _meta: metadata });
export const listParams = commonParams.extend({
  cursor: z.string().optional(),
});
export const callParams = commonParams.extend({
  name: z.string(),
  arguments: object.optional(),
  requestState: z.string().optional(),
  inputResponses: object.optional(),
});
