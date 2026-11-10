import {
  INTERNAL_ERROR,
  type Resource as ProtocolResource,
} from "@toolgrain/protocol";
import { type ErrorHandler, reportError } from "../diagnostics.js";
import { createListPager, type ListPage } from "../protocol/pagination.js";
import { ProtocolError } from "../protocol/responses.js";
import type { ToolContext } from "../tools/context.js";
import { assertJSON } from "../tools/json-value.js";
import {
  isResource,
  RESOURCE_METADATA_KEYS,
  type Resource,
} from "./definition.js";
import {
  copyReadResult,
  type ResourceExecutionResult,
  resourceMetadata,
} from "./validation.js";

type Reader = (
  ctx: ToolContext,
) => Promise<ResourceExecutionResult | undefined>;
export interface ResourceRegistry {
  list(cursor?: string): ListPage<ProtocolResource>;
  reader(uri: string): Reader | undefined;
}

export function createResourceRegistry(
  definitions: readonly Resource[],
  onError?: ErrorHandler,
  pageSize?: number,
): ResourceRegistry {
  const entries = new Map<
    string,
    { metadata: ProtocolResource; read: Reader }
  >();
  for (const definition of definitions) {
    if (!isResource(definition))
      throw new TypeError("Resources must be created with resource()");
    const fields: Record<string, unknown> = {};
    for (const key of RESOURCE_METADATA_KEYS)
      if (definition[key] !== undefined) fields[key] = definition[key];
    assertJSON(fields);
    const metadata = resourceMetadata.parse(
      structuredClone(fields),
    ) as ProtocolResource;
    if (entries.has(metadata.uri))
      throw new TypeError(`Duplicate resource URI: ${metadata.uri}`);
    if (typeof definition.read !== "function")
      throw new TypeError("Resources require a read function");
    entries.set(metadata.uri, {
      metadata,
      async read(ctx) {
        if (ctx.signal.aborted) return;
        try {
          const value = await definition.read(metadata.uri, ctx);
          if (ctx.signal.aborted) return;
          const result = copyReadResult(value);
          return ctx.signal.aborted ? undefined : result;
        } catch (error) {
          if (ctx.signal.aborted) return;
          reportError(onError, error);
          throw new ProtocolError(INTERNAL_ERROR, "Internal error");
        }
      },
    });
  }
  return {
    list: createListPager(
      Array.from(entries.values(), ({ metadata }) => metadata),
      pageSize,
    ),
    reader: (uri) => entries.get(uri)?.read,
  };
}
