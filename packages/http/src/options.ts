export interface HttpOptions {
  allowedOrigins?: readonly string[];
  maxMessageBytes?: number;
}

export function resolveHttpOptions(options: HttpOptions) {
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
  return { maxMessageBytes: limit, allowedOrigins: origins };
}
