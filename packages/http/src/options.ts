export interface HttpOptions {
  /** Exact endpoint path; defaults to /mcp. Mount the combined handler at the root. */
  path?: string;
  /** Exact hosts with optional ports. Defaults to loopback hosts on any port. */
  allowedHosts?: readonly string[];
  allowedOrigins?: readonly string[];
  maxMessageBytes?: number;
}

export function resolveHttpOptions(options: HttpOptions) {
  const path = options.path ?? "/mcp";
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\s?#\\]/.test(path) ||
    new URL(path, "https://endpoint.invalid").pathname !== path
  )
    throw new TypeError(
      "path must be an absolute URL path without a query or fragment",
    );
  const limit = options.maxMessageBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit <= 0)
    throw new RangeError("maxMessageBytes must be a positive safe integer");
  const origins = new Set(
    (options.allowedOrigins ?? []).map((origin) => {
      if (new URL(origin).origin !== origin || origin === "null")
        throw new TypeError("allowedOrigins must contain exact URL origins");
      return origin;
    }),
  );
  return { path, maxMessageBytes: limit, allowedOrigins: origins };
}
