import { JSONRPC_VERSION } from "@toolgrain/protocol";
import { z } from "zod";

export const object = z.record(z.string(), z.unknown());
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
export const cancellation = z.looseObject({
  requestId,
  reason: z.string().optional(),
  _meta: object.optional(),
});

export type Request = z.infer<typeof envelope> & {
  id: z.infer<typeof requestId>;
};
export type Notification = z.infer<typeof envelope>;
