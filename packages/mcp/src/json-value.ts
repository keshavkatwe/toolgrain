import type { JSONValue } from "./vendor/schema.js";

export function assertJSON(
  value: unknown,
  ancestors = new Set<object>(),
): asserts value is JSONValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || value === null)
    throw new Error("Tool output must be a JSON value");
  if (ancestors.has(value)) throw new Error("Tool output contains a cycle");
  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  )
    throw new Error("Tool output contains a non-JSON object instance");
  ancestors.add(value);
  try {
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      if (Array.isArray(value) && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string" ||
        !descriptor?.enumerable ||
        !("value" in descriptor)
      )
        throw new Error("Tool output contains a non-JSON property");
      if (
        Array.isArray(value) &&
        (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
      )
        throw new Error("Tool output contains a non-JSON array property");
      assertJSON(descriptor.value, ancestors);
    }
    if (Array.isArray(value) && keys.length !== value.length + 1)
      throw new Error("Tool output contains a sparse array");
  } finally {
    ancestors.delete(value);
  }
}
