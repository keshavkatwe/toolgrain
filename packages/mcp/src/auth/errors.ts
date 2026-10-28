import { validateAuthScopes } from "./scopes.js";

/** Public authorization failure categories mapped by HTTP adapters to 400, 401, 403, or 503. */
export type AuthErrorCode =
  | "invalid_request"
  | "invalid_token"
  | "access_denied"
  | "insufficient_scope"
  | "temporarily_unavailable";

const brand = Symbol.for("@toolgrain/mcp/AuthError/v1");

/** Only an explicitly public description is exposed; provider causes stay private. */
export class AuthError extends Error {
  readonly [brand] = true;
  /** Explicitly client-visible guidance; omitted descriptions keep HTTP responses generic. */
  readonly description?: string | undefined;
  /** Copied, frozen required scopes for an `insufficient_scope` Bearer challenge; never inferred from supported scopes. */
  readonly requiredScopes?: readonly string[] | undefined;

  /**
   * Create an authorization failure with optional public guidance and a private cause.
   *
   * @param code - Authorization failure category used by HTTP adapters.
   * @param options - Optional public description/required scopes and private standard `Error` options.
   * @throws `TypeError` for invalid required scopes or required scopes on another error code.
   */
  constructor(
    /** Failure category; determines the default message and HTTP status. */
    readonly code: AuthErrorCode,
    options?: ErrorOptions & {
      /** Public message included in HTTP error bodies and challenges; never include secrets. */
      description?: string;
      /** Public required scope tokens, only for `insufficient_scope`; an empty array omits the challenge's scope field. */
      requiredScopes?: readonly string[];
    },
  ) {
    super(
      options?.description ??
        {
          invalid_request: "Invalid authorization request",
          invalid_token: "Invalid access token",
          access_denied: "Access denied",
          insufficient_scope: "Access token has insufficient scope",
          temporarily_unavailable: "Authorization service unavailable",
        }[code],
      options,
    );
    this.name = "AuthError";
    this.description = options?.description;
    if (options?.requiredScopes !== undefined) {
      if (code !== "insufficient_scope")
        throw new TypeError(
          "Required scopes apply only to insufficient_scope errors",
        );
      this.requiredScopes = validateAuthScopes(options.requiredScopes);
    }
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
