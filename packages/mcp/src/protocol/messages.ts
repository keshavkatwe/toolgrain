import { JSONRPC_VERSION } from "@toolgrain/protocol";
import { z } from "zod";
import { metadata } from "./metadata.js";

const object = z.record(z.string(), z.unknown());
export const requestId = z.union([z.string(), z.number().finite()]);
export const envelope = z
  .looseObject({
    jsonrpc: z.literal(JSONRPC_VERSION),
    method: z.string(),
    id: requestId.optional(),
    params: object.optional(),
  })
  .refine(
    (value) =>
      !Object.hasOwn(value, "result") && !Object.hasOwn(value, "error"),
  );
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
export const cancellation = z.looseObject({
  requestId,
  reason: z.string().optional(),
  _meta: object.optional(),
});

export type Request = z.infer<typeof envelope> & {
  id: z.infer<typeof requestId>;
};
