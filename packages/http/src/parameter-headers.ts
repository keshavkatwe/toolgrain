import type { Tool } from "@toolgrain/protocol";
import { type ObjectValue, object } from "./object.js";
export type ParameterHeaders = Map<string, ParameterHeader[]>;

export interface ParameterHeader {
  name: string;
  path: string[];
  integer: boolean;
}
export function parameterHeaders(tools: Tool[]): ParameterHeaders {
  const result = new Map<string, ParameterHeader[]>();
  for (const tool of tools) {
    const headers: ParameterHeader[] = [];
    const names = new Set<string>();
    function visit(value: unknown, path: string[], reachable: boolean) {
      const schema = object(value);
      if (!schema) {
        if (Array.isArray(value))
          for (const item of value) visit(item, path, false);
        return;
      }
      const name = schema["x-mcp-header"];
      if (name !== undefined) {
        if (
          !reachable ||
          path.length === 0 ||
          typeof name !== "string" ||
          !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
          !["string", "integer", "boolean"].includes(String(schema.type)) ||
          names.has(name.toLowerCase())
        )
          throw new Error(
            `Invalid x-mcp-header annotation for tool: ${tool.name}`,
          );
        names.add(name.toLowerCase());
        headers.push({
          name: `Mcp-Param-${name}`,
          path,
          integer: schema.type === "integer",
        });
      }
      for (const [key, child] of Object.entries(schema)) {
        if (key === "properties" && object(child)) {
          for (const [property, nested] of Object.entries(child as ObjectValue))
            visit(nested, [...path, property], reachable);
        } else if (
          key !== "default" &&
          key !== "examples" &&
          key !== "enum" &&
          key !== "const"
        ) {
          visit(child, path, false);
        }
      }
    }
    visit(tool.inputSchema, [], true);
    result.set(tool.name, headers);
  }
  return result;
}
