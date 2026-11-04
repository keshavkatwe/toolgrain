import { abortable } from "./abort.js";
import { identitySnapshot } from "./context.js";
import { AuthError } from "./errors.js";
import { validateAuthScopes } from "./scopes.js";
import type {
  AuthIdentity,
  AuthMetadata,
  AuthProvider,
  AuthScope,
} from "./types.js";
import { authUrl } from "./url.js";

interface Entry {
  identity: AuthIdentity;
  consumed: boolean;
  disposed: boolean;
}

export function createAuthorization(provider?: AuthProvider) {
  const scopes = new WeakMap<AuthScope, Entry>();
  const metadata: AuthMetadata | undefined = provider && {
    ...(provider.resource === undefined
      ? {}
      : { resource: authUrl(provider.resource) }),
    authorizationServers: provider.authorizationServers.map((issuer) => {
      authUrl(issuer);
      return issuer;
    }),
    ...(provider.scopesSupported === undefined
      ? {}
      : { scopesSupported: validateAuthScopes(provider.scopesSupported) }),
  };
  if (
    provider &&
    (typeof provider.type !== "symbol" ||
      !metadata?.authorizationServers.length)
  )
    throw new TypeError(
      "Auth providers require a type symbol and at least one authorization server",
    );
  const verify = provider?.verify.bind(provider);
  const type = provider?.type;
  return {
    metadata: () => metadata && structuredClone(metadata),
    async authorize(
      token: string,
      resource: string,
      signal: AbortSignal,
      finish: () => void,
    ): Promise<AuthScope> {
      if (!verify || !type) throw new Error("Server has no auth provider");
      signal.throwIfAborted();
      const resolved = metadata?.resource ?? authUrl(resource);
      const identity = {
        type,
        value: identitySnapshot(
          await abortable(
            verify(token, { resource: resolved, signal }),
            signal,
          ),
        ),
      };
      signal.throwIfAborted();
      const entry: Entry = { identity, consumed: false, disposed: false };
      const scope = Object.freeze({
        signal,
        dispose() {
          if (entry.disposed) return;
          entry.disposed = true;
          finish();
        },
      });
      scopes.set(scope, entry);
      return scope;
    },
    consume(scope?: AuthScope): AuthIdentity | undefined {
      if (!metadata && !scope) return;
      const entry = scope && scopes.get(scope);
      if (!entry || entry.consumed || entry.disposed)
        throw new AuthError("invalid_token");
      entry.consumed = true;
      return entry.identity;
    },
  };
}
