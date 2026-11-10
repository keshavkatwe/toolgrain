import { INVALID_PARAMS } from "@toolgrain/protocol";
import { ProtocolError } from "./responses.js";

export interface ListPage<T> {
  items: T[];
  nextCursor?: string;
}

/** One immutable registration snapshot; no per-request or issued-cursor state. */
export function createListPager<T>(entries: readonly T[], pageSize = 100) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new TypeError("listPageSize must be a positive safe integer");
  // A separate namespace per list prevents reuse across servers and methods.
  const prefix = `${crypto.randomUUID()}:`;
  return (cursor?: string): ListPage<T> => {
    const start =
      cursor === undefined ? 0 : Number(cursor.slice(prefix.length));
    if (
      cursor !== undefined &&
      (cursor !== `${prefix}${start}` ||
        !Number.isSafeInteger(start) ||
        start < 1 ||
        start >= entries.length ||
        start % pageSize !== 0)
    )
      throw new ProtocolError(INVALID_PARAMS, "Invalid list cursor");
    const end = start + Math.min(pageSize, entries.length - start);
    return {
      items: structuredClone(entries.slice(start, end)),
      ...(end < entries.length ? { nextCursor: `${prefix}${end}` } : {}),
    };
  };
}
