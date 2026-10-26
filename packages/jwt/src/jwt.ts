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
import { createRemoteJWKSet, customFetch, errors, jwtVerify } from "jose";
import { discoverJwks, fetchJson } from "./discovery.js";

/** Standard verified JWT claims plus provider-specific claims typed as `unknown`. */
export interface JwtClaims {
  /** Required issuer, verified against the configured issuer URL. */
  readonly iss: string;
  /** Required audience containing the exact resolved MCP resource URL. */
  readonly aud: string | readonly string[];
  /** Required expiration time as NumericDate seconds since the Unix epoch. */
  readonly exp: number;
  /** Optional subject identifier; its meaning is defined by the authorization server. */
  readonly sub?: string;
  /** Optional issued-at time as NumericDate seconds since the Unix epoch. */
  readonly iat?: number;
  /** Optional not-before time as NumericDate seconds; enforced during JWT verification. */
  readonly nbf?: number;
  /** Optional token identifier supplied by the authorization server. */
  readonly jti?: string;
  /** Additional verified claims; narrow their types before using them in application policy. */
  readonly [claim: string]: unknown;
}

/** Plain JWT identity exposed by the synchronous `useAuth(ctx)` accessor. */
export interface JwtAuth {
  /** Verified claims, copied and deeply frozen when attached to a server invocation. */
  readonly claims: JwtClaims;
}

/** Trusted issuer, signing keys, audience override, and accepted signature algorithms. */
export interface JwtOptions {
  /** Expected issuer and advertised authorization server; HTTPS or HTTP loopback for development. */
  issuer: string;
  /** Explicit signing-key URL; otherwise discovered from the issuer's OAuth/OIDC metadata. */
  jwksUrl?: string;
  /** Canonical public MCP resource and required audience; otherwise inferred by the HTTP adapter. */
  resource?: string;
  /** Supported asymmetric signature algorithms; defaults to `RS256` and `ES256`. The array is copied. */
  algorithms?: readonly string[];
}

const type = Symbol.for("@toolgrain/jwt/auth/v1");
const supported = new Set([
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
  "Ed25519",
]);
const invalidCodes = new Set([
  "ERR_JWT_EXPIRED",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JWS_INVALID",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JWT_INVALID",
  "ERR_JWKS_NO_MATCHING_KEY",
]);

/**
 * Read this invocation's already verified, deeply frozen JWT identity synchronously.
 * Performs no token verification or network work; configure `jwt()` on the server first.
 *
 * @param ctx - Toolgrain context from a handler or lazy provider on a JWT-protected server.
 * @returns Readonly identity containing the verified token claims.
 * @throws If the context is unauthenticated or belongs to a different auth provider.
 */
export const useAuth: (ctx: ToolContext) => AuthReadonly<JwtAuth> =
  createAuthAccessor<JwtAuth>(type);

/**
 * Create an authorization provider verifying OAuth JWT access tokens for an MCP resource.
 * Verifies signatures, issuer, expiry, and audience; signing keys are fetched lazily.
 * This provider does not issue tokens or implement login, consent, or an authorization server.
 *
 * @param options - Trusted issuer, optional signing-key URL/resource, and allowed algorithms.
 * @returns A frozen provider for `createServer({ auth })`; read its identity with `useAuth(ctx)`.
 * @throws For invalid configuration. During verification, credential failures become
 * `AuthError("invalid_token")`; discovery, key retrieval, and provider failures become
 * `AuthError("temporarily_unavailable")` with the original private cause.
 */
export function jwt(options: JwtOptions): AuthProvider<JwtAuth> {
  const issuer = validateAuthUrl(options.issuer);
  const explicit =
    options.jwksUrl === undefined
      ? undefined
      : validateAuthUrl(options.jwksUrl);
  const resource =
    options.resource === undefined
      ? undefined
      : validateAuthUrl(options.resource);
  const algorithms = [...(options.algorithms ?? ["RS256", "ES256"])];
  if (
    !algorithms.length ||
    algorithms.some((algorithm) => !supported.has(algorithm))
  )
    throw new TypeError(
      "JWT algorithms must be supported asymmetric signature algorithms",
    );
  const remote = (url: string) =>
    createRemoteJWKSet(new URL(url), {
      [customFetch]: async (address, init) =>
        Response.json(await fetchJson(address, init.signal, 512 * 1024)),
    });
  let resolver: Promise<ReturnType<typeof remote>> | undefined;
  let expires = 0;
  const keys = () => {
    if (!resolver || Date.now() >= expires) {
      expires = explicit ? Number.POSITIVE_INFINITY : Date.now() + 600000;
      resolver = (explicit ? Promise.resolve(explicit) : discoverJwks(issuer))
        .then(remote)
        .catch((error) => {
          resolver = undefined;
          throw error;
        });
    }
    return resolver;
  };
  return Object.freeze({
    type,
    ...(resource === undefined ? {} : { resource }),
    authorizationServers: Object.freeze([issuer]),
    async verify(token, { signal, resource: requested }) {
      signal.throwIfAborted();
      let keyRequested = false;
      try {
        const resolve = await keys();
        const { payload } = await jwtVerify(
          token,
          (header, signature) => {
            keyRequested = true;
            return resolve(header, signature);
          },
          {
            issuer,
            algorithms,
            requiredClaims: ["iss", "exp"],
          },
        );
        signal.throwIfAborted();
        if (
          ["sub", "jti"].some(
            (claim) =>
              payload[claim] !== undefined &&
              typeof payload[claim] !== "string",
          ) ||
          ["exp", "iat", "nbf"].some(
            (claim) =>
              payload[claim] !== undefined &&
              (typeof payload[claim] !== "number" ||
                !Number.isFinite(payload[claim])),
          )
        )
          throw new AuthError("invalid_token");
        validateTokenAudience(payload.aud, resource ?? requested);
        return { claims: payload as JwtClaims };
      } catch (error) {
        signal.throwIfAborted();
        if (isAuthError(error)) throw error;
        throw new AuthError(
          error instanceof errors.JOSEError &&
            (invalidCodes.has(error.code) ||
              // Unsupported token headers fail before key lookup; key/crypto failures are provider errors.
              (error.code === "ERR_JOSE_NOT_SUPPORTED" && !keyRequested))
            ? "invalid_token"
            : "temporarily_unavailable",
          { cause: error },
        );
      }
    },
  } satisfies AuthProvider<JwtAuth>);
}
