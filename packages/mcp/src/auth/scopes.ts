/**
 * Validate OAuth scope tokens and return a frozen copy, preserving case and order.
 * An empty array explicitly declares no scopes; omission is handled by the caller.
 *
 * @param scopes - Unique, nonempty ASCII scope tokens from RFC 6749 section 3.3.
 * @returns A readonly snapshot suitable for resource metadata or scope challenges.
 * @throws `TypeError` for non-arrays, duplicates, whitespace, quotes, backslashes, or non-ASCII tokens.
 */
export function validateAuthScopes(
  scopes: readonly string[],
): readonly string[] {
  const copy: string[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(scopes))
    throw new TypeError("OAuth scopes must be an array of scope tokens");
  for (const scope of scopes) {
    if (
      typeof scope !== "string" ||
      !scope.length ||
      /[^\x21\x23-\x5b\x5d-\x7e]/.test(scope) ||
      seen.has(scope)
    )
      throw new TypeError(
        "OAuth scopes must be unique, nonempty RFC 6749 scope tokens",
      );
    seen.add(scope);
    copy.push(scope);
  }
  return Object.freeze(copy);
}
