import {
  AuthError,
  type AuthProvider,
  createAuthAccessor,
  isAuthError,
  validateAuthUrl,
} from "@toolgrain/mcp";
import { createRemoteJWKSet, customFetch, errors, jwtVerify } from "jose";
import { discoverJwks, fetchJson } from "./discovery.js";

export interface JwtClaims {
  readonly iss: string;
  readonly aud: string | readonly string[];
  readonly exp: number;
  readonly sub?: string;
  readonly iat?: number;
  readonly nbf?: number;
  readonly jti?: string;
  readonly [claim: string]: unknown;
}

export interface JwtAuth {
  readonly claims: JwtClaims;
}

export interface JwtOptions {
  issuer: string;
  jwksUrl?: string;
  resource?: string;
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

export const useAuth = createAuthAccessor<JwtAuth>(type);

/** Verify access tokens issued by a trusted OAuth server; this does not issue tokens. */
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
      try {
        const { payload } = await jwtVerify(token, await keys(), {
          issuer,
          audience: resource ?? requested,
          algorithms,
          requiredClaims: ["iss", "aud", "exp"],
        });
        signal.throwIfAborted();
        if (
          ["sub", "jti"].some(
            (claim) =>
              payload[claim] !== undefined &&
              typeof payload[claim] !== "string",
          ) ||
          ["iat", "nbf"].some(
            (claim) =>
              payload[claim] !== undefined &&
              (typeof payload[claim] !== "number" ||
                !Number.isFinite(payload[claim])),
          )
        )
          throw new AuthError("invalid_token");
        return { claims: payload as JwtClaims };
      } catch (error) {
        signal.throwIfAborted();
        if (isAuthError(error)) throw error;
        throw new AuthError(
          error instanceof errors.JOSEError && invalidCodes.has(error.code)
            ? "invalid_token"
            : "temporarily_unavailable",
          { cause: error },
        );
      }
    },
  } satisfies AuthProvider<JwtAuth>);
}
