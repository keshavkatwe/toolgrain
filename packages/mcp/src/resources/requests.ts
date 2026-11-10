import { INVALID_PARAMS, METHOD_NOT_FOUND } from "@toolgrain/protocol";
import { z } from "zod";
import { object } from "../protocol/messages.js";
import { ProtocolError } from "../protocol/responses.js";
import type { ToolContext } from "../tools/context.js";
import type { ResourceRegistry } from "./registry.js";
import { resourceUri } from "./validation.js";

const listParams = z.looseObject({
  _meta: object.optional(),
  cursor: z.string().optional(),
});
const readParams = z.looseObject({
  _meta: object.optional(),
  uri: resourceUri,
});

export function requireResources(
  resources: ResourceRegistry | undefined,
): ResourceRegistry {
  if (!resources) throw new ProtocolError(METHOD_NOT_FOUND, "Method not found");
  return resources;
}

function validateList(params: unknown) {
  const parsed = listParams.safeParse(params ?? {});
  if (!parsed.success)
    throw new ProtocolError(INVALID_PARAMS, "Invalid resource list parameters");
  return parsed.data;
}

export function listResources(params: unknown, resources: ResourceRegistry) {
  const { cursor } = validateList(params);
  const { items, ...pagination } = resources.list(cursor);
  return { resources: items, ...pagination };
}

export function listResourceTemplates(
  params: unknown,
  _resources: ResourceRegistry,
) {
  if (validateList(params).cursor !== undefined)
    throw new ProtocolError(INVALID_PARAMS, "Invalid resource list parameters");
  return { resourceTemplates: [] };
}

export async function readResource(
  params: unknown,
  resources: ResourceRegistry,
  ctx: (params: { _meta?: Record<string, unknown> | undefined }) => ToolContext,
  notFoundCode: number,
) {
  const parsed = readParams.safeParse(params);
  if (!parsed.success)
    throw new ProtocolError(INVALID_PARAMS, "Invalid resource read parameters");
  const read = resources.reader(parsed.data.uri);
  if (!read)
    throw new ProtocolError(notFoundCode, "Resource not found", {
      uri: parsed.data.uri,
    });
  return read(ctx(parsed.data));
}
