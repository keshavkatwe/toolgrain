import {
  type ContextBinding,
  contextBinding,
  type RegisteredContextProvider,
} from "./definition.js";

export type ContextRegistry = ReadonlyMap<symbol, ContextBinding>;

/** Snapshot definitions once; provider names are labels, not registration keys. */
export function createContextRegistry(
  providers: readonly RegisteredContextProvider[] = [],
): ContextRegistry {
  if (!Array.isArray(providers))
    throw new TypeError("Context registration must be an array of providers");
  const registry = new Map<symbol, ContextBinding>();
  for (const provider of providers) {
    const binding = contextBinding(provider);
    if (registry.has(binding.identity))
      throw new TypeError(
        `Context provider ${JSON.stringify(binding.name)} is registered more than once`,
      );
    registry.set(binding.identity, binding);
  }
  return registry;
}
