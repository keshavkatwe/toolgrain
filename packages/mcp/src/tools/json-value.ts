import type { JSONValue } from "@toolgrain/protocol";

export type JsonCompatible<Value> = Value extends
  | string
  | number
  | boolean
  | null
  ? Value
  : Value extends (...args: never[]) => unknown
    ? never
    : Value extends readonly (infer Item)[]
      ? readonly JsonCompatible<Item>[]
      : Value extends object
        ? { [Key in keyof Value]: JsonCompatible<Value[Key]> }
        : never;

export type IsJsonCompatible<Value> = [Value] extends [JsonCompatible<Value>]
  ? true
  : false;

export interface AssertJSONOptions {
  /** Treat undefined object properties as absent, matching JSON serialization. */
  readonly omitUndefined?: boolean;
}

export function assertJSON(
  value: unknown,
  options: AssertJSONOptions = {},
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
      if (
        options.omitUndefined &&
        !Array.isArray(value) &&
        descriptor.value === undefined
      )
        continue;
      assertJSON(descriptor.value, options, ancestors);
    }
    if (Array.isArray(value) && keys.length !== value.length + 1)
      throw new Error("Tool output contains a sparse array");
  } finally {
    ancestors.delete(value);
  }
}
