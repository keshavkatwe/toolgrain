export type AuthErrorCode =
  | "invalid_request"
  | "invalid_token"
  | "access_denied"
  | "temporarily_unavailable";

const brand = Symbol.for("@toolgrain/mcp/AuthError/v1");

/** Public messages are deliberately independent of provider diagnostics and credentials. */
export class AuthError extends Error {
  readonly [brand] = true;

  constructor(
    readonly code: AuthErrorCode,
    options?: ErrorOptions,
  ) {
    super(
      {
        invalid_request: "Invalid authorization request",
        invalid_token: "Invalid access token",
        access_denied: "Access denied",
        temporarily_unavailable: "Authorization service unavailable",
      }[code],
      options,
    );
    this.name = "AuthError";
  }
}

export function isAuthError(value: unknown): value is AuthError {
  return value instanceof Error && Reflect.get(value, brand) === true;
}
