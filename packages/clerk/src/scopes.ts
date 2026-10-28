/**
 * Clerk's built-in OAuth scope names; instance/application settings determine availability.
 * `user:org:read` requires Organizations. This list is not a recommended grant or a default.
 */
export const CLERK_OAUTH_SCOPES = Object.freeze([
  "openid",
  "profile",
  "email",
  "offline_access",
  "public_metadata",
  "private_metadata",
  "user:org:read",
] as const);

/** One of Clerk's documented built-in OAuth scopes. */
export type ClerkBuiltInOAuthScope = (typeof CLERK_OAUTH_SCOPES)[number];

/**
 * A built-in or instance-defined custom Clerk OAuth scope.
 * Built-ins retain editor completion; custom names still require configuration in Clerk.
 * Runtime validation checks OAuth syntax, not the instance's allowed-scope catalog.
 */
export type ClerkOAuthScope =
  | ClerkBuiltInOAuthScope
  | (string & Record<never, never>);
