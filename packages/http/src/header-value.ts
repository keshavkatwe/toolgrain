export function decodeHeaderValue(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: HTTP permits horizontal tab and visible ASCII only.
  if (/[^\x09\x20-\x7e]/.test(value))
    throw new Error("Invalid header characters");
  if (!value.startsWith("=?base64?") || !value.endsWith("?=")) return value;
  const encoded = value.slice(9, -2);
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    )
  )
    throw new Error("Invalid Base64 header");
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
