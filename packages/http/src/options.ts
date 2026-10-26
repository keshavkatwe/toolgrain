/** Endpoint routing, request validation, and body-size limits shared by HTTP adapters. */
export interface HttpOptions {
  /** Exact endpoint path; defaults to /mcp. Mount the combined handler at the root. */
  path?: string;
  /**
   * Exact hostnames/IPs with optional ports; schemes, paths, and wildcards are rejected.
   * Handlers default to loopback hosts on any port; managed `http()` restricts them
   * to its listening port. An empty list denies every host. The array is copied.
   */
  allowedHosts?: readonly string[];
  /**
   * Exact URL origins permitted in an MCP request's `Origin` header; defaults to none.
   * Requests without an Origin header are unaffected. This is separate from host
   * validation and does not implement CORS. The array is copied.
   */
  allowedOrigins?: readonly string[];
  /** Maximum incoming JSON body bytes; a positive safe integer, defaulting to 1 MiB. */
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
