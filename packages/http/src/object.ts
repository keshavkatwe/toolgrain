export type ObjectValue = Record<string, unknown>;
export function object(value: unknown): ObjectValue | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as ObjectValue)
    : undefined;
}
