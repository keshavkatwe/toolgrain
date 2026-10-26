import type { ToolContext } from "../tools/context.js";
import { readContext } from "./access.js";

const brand = Symbol.for("@toolgrain/mcp/context-provider/v1");
const bindingKey = Symbol.for("@toolgrain/mcp/context-binding/v1");

export interface ContextBinding {
  readonly identity: symbol;
  readonly name: string;
  readonly resolve: (ctx: ToolContext) => unknown;
}

/** Erase values for heterogeneous registrations without exposing unsafe overrides. */
export abstract class RegisteredContextProvider {
  /** Nonempty diagnostic label; distinct providers may share a name without sharing identity. */
  abstract readonly name: string;
  abstract readonly use: (ctx: ToolContext) => Promise<unknown>;

  // Structural branding keeps compatible package copies interoperable.
  "~toolgrain"(): "context@1" {
    return "context@1";
  }
}
Object.defineProperty(RegisteredContextProvider.prototype, brand, {
  value: true,
});

/** An opaque, invariant value contract; use createContext() and provide() for bindings. */
export abstract class ContextProvider<Value> extends RegisteredContextProvider {
  /**
   * Read the context's lazy value, sharing one promise across concurrent readers.
   * Always returns a promise, even for synchronous resolvers. Values remain unchanged
   * and application-owned. Missing bindings, cycles, cancellation, and resolver failures reject.
   *
   * @param ctx - Context supplied by Toolgrain to a handler/resolver or made with `toolContext()`.
   * @returns This context's cached value or failure for the provider identity.
   */
  abstract readonly use: (ctx: ToolContext) => Promise<Value>;
  // A function property prevents widening Value and then overriding it incompatibly.
  /**
   * Create an override with the same identity and inferred value contract.
   * Register the override instead of the original; existing accessors find it automatically.
   *
   * @param resolve - Replacement factory, invoked only on first access in each context.
   * @returns A frozen provider binding without changing this provider or other registrations.
   */
  abstract readonly provide: (
    resolve: (ctx: ToolContext) => Value | PromiseLike<Value>,
  ) => ContextProvider<Value>;
}

class Provider<Value> extends ContextProvider<Value> {
  readonly name: string;
  readonly use: (ctx: ToolContext) => Promise<Value>;

  constructor(
    binding: ContextBinding,
    use = (ctx: ToolContext) =>
      readContext<Value>(ctx, binding.identity, binding.name),
  ) {
    super();
    this.name = binding.name;
    this.use = use;
    Object.defineProperty(this, bindingKey, { value: Object.freeze(binding) });
    Object.freeze(this);
  }

  readonly provide = (
    resolve: (ctx: ToolContext) => Value | PromiseLike<Value>,
  ): ContextProvider<Value> => {
    if (typeof resolve !== "function")
      throw new TypeError(
        "Context provider overrides require a resolver function",
      );
    return new Provider<Value>({ ...contextBinding(this), resolve }, this.use);
  };
}

/**
 * Define a lazy provider with an inferred value type, including asynchronous factories.
 * Register it in a server or `toolContext()` before calling its `use` accessor.
 * Identity belongs to the definition, not its name. Resources remain application-owned;
 * Toolgrain does not copy, freeze, or automatically dispose the resolved value.
 *
 * @param options - Diagnostic name and factory for the value.
 * @returns A frozen provider with a typed async accessor and override factory.
 * @throws `TypeError` if the name is empty or the resolver is not a function.
 */
export function createContext<Value>(options: {
  /** Nonempty diagnostic label, used in missing-provider and dependency-cycle errors. */
  name: string;
  /** Lazy factory; may await other registered providers and should pass `ctx.signal` to work. */
  resolve: (ctx: ToolContext) => Value;
}): ContextProvider<Awaited<Value>> {
  if (
    !options ||
    typeof options.name !== "string" ||
    !options.name.trim() ||
    typeof options.resolve !== "function"
  )
    throw new TypeError(
      "Context providers require a nonempty name and a resolver function",
    );
  return new Provider<Awaited<Value>>({
    identity: Symbol(options.name),
    name: options.name,
    resolve: options.resolve,
  });
}

export function contextBinding(provider: unknown): ContextBinding {
  if (
    typeof provider !== "object" ||
    provider === null ||
    (provider as { [brand]?: unknown })[brand] !== true
  )
    throw new TypeError(
      "Context providers must be created with createContext()",
    );
  const binding = Object.getOwnPropertyDescriptor(provider, bindingKey)
    ?.value as ContextBinding | undefined;
  if (!binding)
    throw new TypeError(
      "Context providers must be created with createContext()",
    );
  return binding;
}
