import { createClerkClient } from "@clerk/backend";
import { isClerkAPIResponseError } from "@clerk/backend/errors";
import { parsePublishableKey } from "@clerk/shared/keys";
import { jwt } from "@toolgrain/jwt";
import {
  AuthError,
  type AuthProvider,
  type AuthReadonly,
  createAuthAccessor,
  isAuthError,
  type ToolContext,
  validateAuthUrl,
  validateTokenAudience,
} from "@toolgrain/mcp";
import { decodeProtectedHeader } from "jose";

/** Plain identity from a verified Clerk OAuth access token, exposed by `useAuth(ctx)`. */
export interface ClerkAuth {
  /** Verified Clerk user subject; accepted access tokens must identify a `user_` subject. */
  readonly userId: string;
  /** OAuth application client ID associated with the verified access token. */
  readonly clientId: string;
  /** Granted token scopes; applications enforce their own per-tool scope policies. */
  readonly scopes: readonly string[];
}

/** Credentials and optional public resource URL for one Clerk application/environment. */
export interface ClerkOptions {
  /** Clerk publishable key identifying the Frontend API and trusted issuer. */
  publishableKey: string;
  /** Server-only Clerk secret key from the same application/environment; never exposed to handlers. */
  secretKey: string;
  /** Canonical public MCP resource and required token audience; otherwise inferred by the HTTP adapter. */
  resource?: string;
}

const type = Symbol.for("@toolgrain/clerk/auth/v1");
/**
 * Read this invocation's already verified, deeply frozen Clerk identity synchronously.
 * Performs no verification or network work; configure `clerk()` on the server first.
 *
 * @param ctx - Toolgrain context from a handler or lazy provider on a Clerk-protected server.
 * @returns Readonly user ID, OAuth client ID, and granted scopes, without SDK token getters.
 * @throws If the context is unauthenticated or belongs to a different auth provider.
 */
export const useAuth: (ctx: ToolContext) => AuthReadonly<ClerkAuth> =
  createAuthAccessor<ClerkAuth>(type);

/**
 * Create an authorization provider for Clerk OAuth JWT and opaque `oat_` access tokens.
 * Requires the token's audience to contain the resolved MCP resource. Enable Clerk's
 * OAuth audience claim setting and obtain a new token before using this integration.
 * Session tokens, API keys, and M2M tokens are rejected.
 *
 * @param options - Clerk keys from the same application/environment and an optional resource URL.
 * @returns A frozen provider for `createServer({ auth })`; read its identity with `useAuth(ctx)`.
 * @throws For invalid keys or configuration. Verification rejects invalid tokens with
 * `AuthError("invalid_token")`, access denial with `access_denied`, and private provider
 * failures with `temporarily_unavailable`.
 */
export function clerk(options: ClerkOptions): AuthProvider<ClerkAuth> {
  const key = parsePublishableKey(options.publishableKey, { fatal: true });
  const issuer = validateAuthUrl(`https://${key.frontendApi}`);
  if (!/^sk_(?:test|live)_.+/.test(options.secretKey))
    throw new TypeError("A Clerk secret key is required");
  const resource =
    options.resource === undefined
      ? undefined
      : validateAuthUrl(options.resource);
  const verifier = jwt({
    issuer,
    algorithms: ["RS256"],
    ...(resource === undefined ? {} : { resource }),
  });
  const client = createClerkClient({
    publishableKey: options.publishableKey,
    secretKey: options.secretKey,
    telemetry: { disabled: true },
  });
  return Object.freeze({
    type,
    authorizationServers: Object.freeze([issuer]),
    ...(resource === undefined ? {} : { resource }),
    async verify(token, verifyOptions) {
      verifyOptions.signal.throwIfAborted();
      try {
        if (token.startsWith("oat_")) {
          const verified = await client.idPOAuthAccessToken.verify(token);
          verifyOptions.signal.throwIfAborted();
          // Clerk may omit `type` for opaque tokens; reject incompatible values when supplied.
          if (
            verified.revoked ||
            verified.expired ||
            (verified.type !== undefined && verified.type !== "oauth_token") ||
            !verified.subject.startsWith("user_") ||
            !verified.clientId
          )
            throw new AuthError("invalid_token");
          validateTokenAudience(
            verified.aud,
            resource ?? verifyOptions.resource,
          );
          return {
            userId: verified.subject,
            clientId: verified.clientId,
            scopes: [...verified.scopes],
          };
        }
        let header: ReturnType<typeof decodeProtectedHeader>;
        try {
          header = decodeProtectedHeader(token);
        } catch {
          throw new AuthError("invalid_token");
        }
        if (header.typ !== "at+jwt" && header.typ !== "application/at+jwt")
          throw new AuthError("invalid_token");
        const { claims } = await verifier.verify(token, verifyOptions);
        if (
          !claims.sub?.startsWith("user_") ||
          typeof claims.client_id !== "string" ||
          !claims.client_id ||
          (claims.scope !== undefined && typeof claims.scope !== "string") ||
          (claims.scp !== undefined &&
            (!Array.isArray(claims.scp) ||
              claims.scp.some((scope) => typeof scope !== "string")))
        )
          throw new AuthError("invalid_token");
        return {
          userId: claims.sub,
          clientId: claims.client_id,
          scopes: Array.isArray(claims.scp)
            ? ([...claims.scp] as string[])
            : typeof claims.scope === "string"
              ? claims.scope.split(/\s+/).filter(Boolean)
              : [],
        };
      } catch (error) {
        verifyOptions.signal.throwIfAborted();
        if (isAuthError(error)) throw error;
        if (isClerkAPIResponseError(error)) {
          const denied = error.status === 403;
          const invalid =
            error.status === 400 ||
            error.status === 404 ||
            error.status === 422;
          throw new AuthError(
            denied
              ? "access_denied"
              : invalid
                ? "invalid_token"
                : "temporarily_unavailable",
            { cause: error },
          );
        }
        throw new AuthError("temporarily_unavailable", { cause: error });
      }
    },
  } satisfies AuthProvider<ClerkAuth>);
}
