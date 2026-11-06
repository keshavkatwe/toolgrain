import type {
  BlobResourceContents,
  MetaObject,
  Resource as ProtocolResource,
  TextResourceContents,
} from "@toolgrain/protocol";
import type { ToolContext } from "../tools/context.js";
import type { DeepReadonly } from "../tools/json-value.js";

/** Readonly resource identity and display metadata, copied during server registration. */
export type ResourceMetadata = DeepReadonly<ProtocolResource>;

/** Explicit resource contents; each item supplies its own URI and exactly one payload. */
export interface ResourceReadResult {
  /** Text or base64 binary entries; an existing resource may return an empty array. */
  readonly contents: readonly (
    | (DeepReadonly<TextResourceContents> & { readonly blob?: never })
    | (DeepReadonly<BlobResourceContents> & { readonly text?: never })
  )[];
  /** Optional result metadata, separate from each content item's metadata. */
  readonly _meta?: DeepReadonly<MetaObject>;
}

type ReadResult = ResourceReadResult | PromiseLike<ResourceReadResult>;

/** A fixed resource and its application-owned reader. */
export interface ResourceDefinition<Result extends ReadResult = ReadResult>
  extends ResourceMetadata {
  /**
   * Read this URI using the request's auth, providers, and cancellation signal.
   * Direct calls bypass server authorization and result validation.
   */
  readonly read: (uri: string, ctx: ToolContext) => Result;
}

export const RESOURCE_METADATA_KEYS = [
  "uri",
  "name",
  "title",
  "description",
  "mimeType",
  "annotations",
  "size",
  "icons",
  "_meta",
] as const;
const brand = Symbol.for("@toolgrain/mcp/resource@1");

/** Frozen reusable definition returned by `resource()`; direct reads remain raw. */
export type Resource<Result extends ReadResult = ReadResult> =
  ResourceDefinition<Result> & ResourceValue;

class ResourceValue {
  constructor(definition: ResourceDefinition) {
    for (const key of [...RESOURCE_METADATA_KEYS, "read"] as const) {
      const value = definition[key];
      if (value !== undefined)
        Object.defineProperty(this, key, { value, enumerable: true });
    }
    Object.freeze(this);
  }

  /** Structural brand shared by compatible package copies; object spreads drop it. */
  "~toolgrain"(): "resource@1" {
    return "resource@1";
  }
}
Object.defineProperty(ResourceValue.prototype, brand, { value: true });

export function isResource(value: unknown): value is Resource {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [brand]?: unknown })[brand] === true
  );
}

/**
 * Declare a reusable fixed-URI resource without reading its contents.
 * Registration validates and snapshots metadata; server reads validate and copy results.
 * No URI is fetched or mapped to a filesystem automatically.
 * @param definition - Absolute URI, display metadata, and synchronous or async reader.
 * @returns A frozen definition preserving the reader's inferred return type.
 * @throws `TypeError` if the reader is not a function.
 */
export function resource<Result extends ReadResult>(
  definition: ResourceDefinition<Result>,
): Resource<Result> {
  if (typeof definition?.read !== "function")
    throw new TypeError("Resources require a read function");
  return new ResourceValue(definition) as Resource<Result>;
}
