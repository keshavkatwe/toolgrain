import type { ToolContext } from "../tools/context.js";
import { withContextAccess } from "./access.js";
import type { ContextRegistry } from "./registry.js";

interface Resolution {
  readonly name: string;
  readonly promise: Promise<unknown>;
  readonly dependencies: Set<Resolution>;
  pending: boolean;
}

/** One cache and pending dependency graph per tool context, independent of request IDs. */
export function createContextScope(
  ctx: ToolContext,
  registry: ContextRegistry,
): ToolContext {
  const resolutions = new Map<symbol, Resolution>();
  const resolve = (
    identity: symbol,
    name: string,
    caller?: Resolution,
  ): Promise<unknown> => {
    const binding = registry.get(identity);
    if (!binding)
      throw new Error(
        `Context provider ${JSON.stringify(name)} is not registered`,
      );
    let resolution = resolutions.get(identity);
    if (!resolution) {
      const current: Resolution = {
        name: binding.name,
        pending: true,
        dependencies: new Set(),
        // Publish the promise before running user code, including synchronous factories.
        promise: Promise.resolve()
          .then(() => {
            ctx.signal.throwIfAborted();
            return binding.resolve(
              withContextAccess(ctx, (key, label) =>
                resolve(key, label, current),
              ),
            );
          })
          .then((value) => {
            ctx.signal.throwIfAborted();
            return value;
          })
          .finally(() => {
            current.pending = false;
            current.dependencies.clear();
          }),
      };
      resolutions.set(identity, current);
      resolution = current;
    }
    if (caller?.pending && resolution.pending) {
      const path = dependencyPath(resolution, caller, new Set());
      if (path)
        throw new Error(
          `Context dependency cycle: ${[caller, ...path].map((item) => item.name).join(" -> ")}`,
        );
      caller.dependencies.add(resolution);
    }
    return resolution.promise;
  };
  return withContextAccess(ctx, (identity, name) => resolve(identity, name));
}

/** Follow only unfinished resolutions; shared pending dependencies are not cycles. */
function dependencyPath(
  from: Resolution,
  target: Resolution,
  visited: Set<Resolution>,
): Resolution[] | undefined {
  if (from === target) return [from];
  if (!from.pending || visited.has(from)) return;
  visited.add(from);
  for (const dependency of from.dependencies) {
    const path = dependencyPath(dependency, target, visited);
    if (path) return [from, ...path];
  }
}
