export type AuthErrorCode =
  | "invalid_request"
  | "invalid_token"
  | "access_denied"
  | "temporarily_unavailable";

const brand = Symbol.for("@toolgrain/mcp/AuthError/v1");

/** Only an explicitly public description is exposed; provider causes stay private. */
export class AuthError extends Error {
  readonly [brand] = true;
  readonly description?: string | undefined;

  constructor(
    readonly code: AuthErrorCode,
    options?: ErrorOptions & { description?: string },
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

export function isAuthError(value: unknown): value is AuthError {
  return value instanceof Error && Reflect.get(value, brand) === true;
}
