import type { ReadResourceResult } from "@toolgrain/protocol";
import { z } from "zod";
import { icon } from "../protocol/icon.js";
import { object } from "../protocol/messages.js";
import { assertJSON } from "../tools/json-value.js";
export type ResourceExecutionResult = Pick<
  ReadResourceResult,
  "contents" | "_meta"
>;

// RFC 3986 components: percent-encoded bytes, unreserved characters, and sub-delimiters.
const atom = "(?:[A-Za-z0-9._~-]|%[A-Fa-f0-9]{2}|[!$&'()*+,;=])";
const path = new RegExp(`^(?:${atom}|[:@/])*$`);
const queryOrFragment = new RegExp(`^(?:${atom}|[:@/?])*$`);
const authority = new RegExp(
  `^(?:(?:${atom}|:)*@)?(?:${atom}*|\\[([^\\]]+)\\])(?::[0-9]*)?$`,
);
const ipFuture = /^v[A-Fa-f0-9]+\.[A-Za-z0-9._~!$&'()*+,;=:-]+$/i;

/** Validate URI components without normalizing registry identities or treating them as URLs. */
export const resourceUri = z.string().refine((value) => {
  const parts =
    /^[A-Za-z][A-Za-z0-9+.-]*:(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#([^#]*))?$/.exec(
      value,
    );
  if (
    !parts ||
    !path.test(parts[2] ?? "") ||
    !queryOrFragment.test(parts[3] ?? "") ||
    !queryOrFragment.test(parts[4] ?? "")
  )
    return false;
  if (parts[1] === undefined) return true;
  const host = authority.exec(parts[1]);
  if (!host) return false;
  const ip = host[1];
  return (
    ip === undefined || ipFuture.test(ip) || URL.canParse(`https://[${ip}]/`)
  );
}, "Resource URI must be an absolute URI");

export const resourceMetadata = z.strictObject({
  uri: resourceUri,
  name: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  annotations: z
    .looseObject({
      audience: z.array(z.enum(["user", "assistant"])).optional(),
      priority: z.number().min(0).max(1).optional(),
      lastModified: z.string().optional(),
    })
    .optional(),
  size: z.number().int().nonnegative().optional(),
  icons: z.array(icon).optional(),
  _meta: object.optional(),
});

const contents = z
  .looseObject({
    uri: resourceUri,
    mimeType: z.string().optional(),
    text: z.string().optional(),
    blob: z.base64().optional(),
    _meta: object.optional(),
  })
  .refine(
    (value) => Object.hasOwn(value, "text") !== Object.hasOwn(value, "blob"),
    "Resource contents require exactly one of text or blob",
  );
const readResult = z.strictObject({
  contents: z.array(contents),
  _meta: object.optional(),
});

export function copyReadResult(value: unknown): ResourceExecutionResult {
  assertJSON(value, { omitUndefined: true });
  return readResult.parse(
    JSON.parse(JSON.stringify(value)),
  ) as ResourceExecutionResult;
}
