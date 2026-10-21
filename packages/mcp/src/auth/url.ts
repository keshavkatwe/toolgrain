/** Canonical external URL; HTTP is permitted only for local development. */
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
