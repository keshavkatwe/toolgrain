import { JSONRPC_VERSION } from "@toolgrain/protocol";
import { z } from "zod";
import { metadata } from "./metadata.js";

const object = z.record(z.string(), z.unknown());
export const legacyCommonParams = z.looseObject({
  _meta: object.optional(),
});
export const initializeParams = legacyCommonParams.extend({
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
export const requestId = z.union([
  z.string(),
  z.number().finite().refine(Number.isInteger, "Request ID must be an integer"),
]);
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
export const legacyListParams = legacyCommonParams.extend({
  cursor: z.string().optional(),
});
export const callParams = commonParams.extend({
  name: z.string(),
  arguments: object.optional(),
  requestState: z.string().optional(),
  inputResponses: object.optional(),
});
export const legacyCallParams = legacyCommonParams.extend({
  name: z.string(),
  arguments: object.optional(),
});
export const cancellation = z.looseObject({
  requestId,
  reason: z.string().optional(),
  _meta: object.optional(),
});

export type Request = z.infer<typeof envelope> & {
  id: z.infer<typeof requestId>;
};
