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
  abstract readonly use: (ctx: ToolContext) => Promise<Value>;
  // A function property prevents widening Value and then overriding it incompatibly.
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

/** Infer the resolved value type, including asynchronous factories. */
export function createContext<Value>(options: {
  name: string;
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
