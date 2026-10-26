/** Public authorization failure categories mapped by HTTP adapters to 400, 401, 403, or 503. */
export type AuthErrorCode =
  | "invalid_request"
  | "invalid_token"
  | "access_denied"
  | "temporarily_unavailable";

const brand = Symbol.for("@toolgrain/mcp/AuthError/v1");

/** Only an explicitly public description is exposed; provider causes stay private. */
export class AuthError extends Error {
  readonly [brand] = true;
  /** Explicitly client-visible guidance; omitted descriptions keep HTTP responses generic. */
  readonly description?: string | undefined;

  /**
   * Create an authorization failure with optional public guidance and a private cause.
   *
   * @param code - Authorization failure category used by HTTP adapters.
   * @param options - Optional public description and private standard `Error` options.
   */
  constructor(
    /** Failure category; determines the default message and HTTP status. */
    readonly code: AuthErrorCode,
    options?: ErrorOptions & {
      /** Public message included in HTTP error bodies and challenges; never include secrets. */
      description?: string;
    },
  ) {
    super(
      options?.description ??
        {
          invalid_request: "Invalid authorization request",
          invalid_token: "Invalid access token",
          access_denied: "Access denied",
          temporarily_unavailable: "Authorization service unavailable",
        }[code],
      options,
    );
    this.name = "AuthError";
    this.description = options?.description;
  }
}

/**
 * Recognize branded authorization errors, including those from compatible package copies.
 *
 * @param value - Any thrown or returned value to inspect.
 * @returns Whether the value is an `Error` with Toolgrain's authorization-error brand.
 */
export function isAuthError(value: unknown): value is AuthError {
  return value instanceof Error && Reflect.get(value, brand) === true;
}
