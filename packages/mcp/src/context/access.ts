import type { ToolContext } from "../tools/context.js";

const key = Symbol.for("@toolgrain/mcp/context-access/v1");
type Access = (identity: symbol, name: string) => Promise<unknown>;

/** Keep own auth properties and shared request data on dependency-aware views. */
export function withContextAccess(
  ctx: ToolContext,
  access: Access,
): ToolContext {
  return Object.freeze(
    Object.create(Object.getPrototypeOf(ctx), {
      ...Object.getOwnPropertyDescriptors(ctx),
      [key]: { value: access },
    }) as ToolContext,
  );
}

export function readContext<Value>(
  ctx: ToolContext,
  identity: symbol,
  name: string,
): Promise<Value> {
  try {
    const access = Object.getOwnPropertyDescriptor(ctx, key)?.value as
      | Access
      | undefined;
    if (!access)
      throw new Error("Context access requires a Toolgrain-created context");
    ctx.signal.throwIfAborted();
    return access(identity, name) as Promise<Value>;
  } catch (error) {
    // Accessors always return promises, including invalid contexts and aborts.
    return Promise.reject(error);
  }
}
