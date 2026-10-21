import { createClerkClient } from "@clerk/backend";
import {
  isClerkAPIResponseError,
  TokenVerificationError,
} from "@clerk/backend/errors";
import { parsePublishableKey } from "@clerk/shared/keys";
import { jwt } from "@toolgrain/jwt";
import {
  AuthError,
  type AuthProvider,
  createAuthAccessor,
  isAuthError,
  validateAuthUrl,
} from "@toolgrain/mcp";
import { decodeProtectedHeader } from "jose";

export interface ClerkAuth {
  readonly userId: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
}

export interface ClerkOptions {
  publishableKey: string;
  secretKey: string;
  resource?: string;
}

const type = Symbol.for("@toolgrain/clerk/auth/v1");
export const useAuth = createAuthAccessor<ClerkAuth>(type);

/** Accept Clerk OAuth access tokens; session tokens, API keys and M2M tokens are excluded. */
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
          const verified = await client.idPOAuthAccessToken.verify(token, {
            audience: resource ?? verifyOptions.resource,
          });
          verifyOptions.signal.throwIfAborted();
          if (
            verified.revoked ||
            verified.expired ||
            verified.type !== "oauth_token" ||
            !verified.subject.startsWith("user_") ||
            !verified.clientId
          )
            throw new AuthError("invalid_token");
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
        if (error instanceof TokenVerificationError)
          throw new AuthError("invalid_token", { cause: error });
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
