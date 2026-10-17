import { decodeHeaderValue } from "./header-value.js";
import { type ObjectValue, object } from "./object.js";
import type { ParameterHeaders } from "./parameter-headers.js";

export function validateRoutingHeaders(
  headers: Headers,
  body: ObjectValue,
  parameters: ParameterHeaders,
  required: boolean,
) {
  const params = object(body.params);
  const method = headers.get("Mcp-Method");
  if ((required || method !== null) && method !== body.method)
    throw new Error("Missing or mismatched method header");
  const source = body.method === "resources/read" ? params?.uri : params?.name;
  if (
    ["tools/call", "resources/read", "prompts/get"].includes(
      String(body.method),
    )
  ) {
    const name = headers.get("Mcp-Name");
    if (
      (required || name !== null) &&
      (name === null ||
        typeof source !== "string" ||
        decodeHeaderValue(name) !== source)
    )
      throw new Error("Missing or mismatched Mcp-Name header");
  }
  if (body.method !== "tools/call" || typeof source !== "string") return;
  for (const entry of parameters.get(source) ?? []) {
    let value: unknown = params?.arguments;
    for (const key of entry.path) {
      const parent = object(value);
      value = parent && Object.hasOwn(parent, key) ? parent[key] : undefined;
    }
    const header = headers.get(entry.name);
    if (value === null || value === undefined) {
      if (header !== null) throw new Error(`Unexpected ${entry.name} header`);
      continue;
    }
    if (header === null) {
      if (required) throw new Error(`Missing ${entry.name} header`);
      continue;
    }
    const actual = decodeHeaderValue(header);
    if (
      entry.integer
        ? !Number.isSafeInteger(value) ||
          actual.trim() === "" ||
          Number(actual) !== value
        : actual !== String(value)
    )
      throw new Error(`Mismatched ${entry.name} header`);
  }
}
