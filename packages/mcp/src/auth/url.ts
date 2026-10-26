/**
 * Validate an auth configuration URL, returning the original string unchanged.
 * Requires HTTPS, except HTTP on `localhost`, `127.0.0.1`, or `[::1]` for development.
 * Credentials, whitespace, control characters, queries, and fragments are rejected.
 *
 * @param value - Authorization-server, signing-key, or canonical resource URL.
 * @returns The supplied URL after validation; no normalization is applied.
 * @throws `TypeError` for an invalid or disallowed URL.
 */
export function authUrl(value: string): string {
  const url = new URL(value);
  if (
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control characters that URL parsing would silently remove.
    /[\u0000-\u0020\u007f]/.test(value) ||
    !/^https?:\/\/[^/]/i.test(value) ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    value.includes("#") ||
    value.includes("?")
  )
    throw new TypeError(
      "Auth URLs must use HTTPS without credentials, query, or fragment (HTTP loopback is allowed)",
    );
  return value;
}
