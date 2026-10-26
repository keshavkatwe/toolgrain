import type { ToolContext } from "../tools/context.js";
import type { AuthIdentity, AuthReadonly } from "./types.js";

const key = Symbol.for("@toolgrain/mcp/auth-context/v1");

/**
 * Create a synchronous accessor for a provider's already verified identity snapshot.
 * Reading the identity performs no verification, network request, or lazy resolution.
 *
 * @typeParam Identity - Plain identity data returned by the matching provider.
 * @param type - The provider's identity symbol; use `Symbol.for()` across package copies.
 * @returns An accessor accepting a tool context and returning its deeply frozen identity.
 * The accessor throws if that context has no identity for this provider.
 */
export function createAuthAccessor<Identity extends object>(type: symbol) {
  return (ctx: ToolContext): AuthReadonly<Identity> => {
    const auth = Object.getOwnPropertyDescriptor(ctx, key)?.value as
      | AuthIdentity
      | undefined;
    if (!auth || auth.type !== type)
      throw new Error("The context has no identity for this auth provider");
    return auth.value as AuthReadonly<Identity>;
  };
}

export function attachAuth(ctx: ToolContext, auth?: AuthIdentity): ToolContext {
  if (auth) Object.defineProperty(ctx, key, { value: auth });
  return Object.freeze(ctx);
}

/** Auth identities are plain data: copy them before exposing them to handlers. */
export function identitySnapshot(value: object): object {
  if (value === null || typeof value !== "object")
    throw new TypeError("Auth identities must be objects");
  const copy = structuredClone(value);
  const freeze = (item: unknown, visited: Set<object>) => {
    if (typeof item !== "object" || item === null || visited.has(item)) return;
    const prototype = Object.getPrototypeOf(item);
    if (
      prototype !== Object.prototype &&
      prototype !== Array.prototype &&
      prototype !== null
    )
      throw new TypeError("Auth identities must contain plain data");
    visited.add(item);
    for (const child of Object.values(item)) freeze(child, visited);
    Object.freeze(item);
  };
  freeze(copy, new Set());
  return copy;
}
