import type {
  AudioContent,
  BlobResourceContents,
  EmbeddedResource,
  ImageContent,
  ResourceLink,
  TextContent,
  TextResourceContents,
} from "@toolgrain/protocol";
import type { DeepReadonly } from "./json-value.js";

/** Base64-encoded data or bytes to encode synchronously; Node Buffers are accepted as Uint8Arrays. */
export type BinaryContentData = string | Uint8Array;

/** Optional content-block annotations and metadata, accepting readonly authoring values. */
export type ContentOptions = DeepReadonly<
  Pick<TextContent, "annotations" | "_meta">
>;

/** Image content without its discriminator; data may be base64 or bytes. */
export type ImageContentOptions = Omit<
  DeepReadonly<ImageContent>,
  "type" | "data"
> & {
  /** Base64 image data or bytes to encode; the supplied byte view is not mutated. */
  readonly data: BinaryContentData;
};

/** Audio content without its discriminator; data may be base64 or bytes. */
export type AudioContentOptions = Omit<
  DeepReadonly<AudioContent>,
  "type" | "data"
> & {
  /** Base64 audio data or bytes to encode; the supplied byte view is not mutated. */
  readonly data: BinaryContentData;
};

/** A resource link's URI, required name, and optional descriptive fields. */
export type ResourceLinkOptions = Omit<DeepReadonly<ResourceLink>, "type">;

/** Embedded text or binary resource contents; text and blob are mutually exclusive. */
export type ResourceContentOptions =
  | (DeepReadonly<TextResourceContents> & { readonly blob?: never })
  | (Omit<DeepReadonly<BlobResourceContents>, "blob"> & {
      /** Base64 resource data or bytes to encode synchronously. */
      readonly blob: BinaryContentData;
      readonly text?: never;
    });

function base64(data: BinaryContentData): string {
  if (typeof data === "string") return data;
  let binary = "";
  // Bound the argument count for large files and encode only the supplied view.
  for (let offset = 0; offset < data.length; offset += 0x8000)
    binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

/**
 * Construct text content with optional annotations and metadata.
 * Wrap the block in mcpResult() to return explicit MCP content from a tool.
 */
function text(
  value: string,
  options: ContentOptions = {},
): DeepReadonly<TextContent> {
  return { ...options, type: "text", text: value };
}

/** Construct inline image content, synchronously encoding bytes when supplied. MIME type is required. */
function image(options: ImageContentOptions): DeepReadonly<ImageContent> {
  return { ...options, type: "image", data: base64(options.data) };
}

/** Construct inline audio content, synchronously encoding bytes when supplied. MIME type is required. */
function audio(options: AudioContentOptions): DeepReadonly<AudioContent> {
  return { ...options, type: "audio", data: base64(options.data) };
}

/** Construct a link to an application-owned resource without fetching it or registering resource methods. */
function resourceLink(
  options: ResourceLinkOptions,
): DeepReadonly<ResourceLink> {
  return { ...options, type: "resource_link" };
}

/**
 * Embed text or binary resource contents without reading files or fetching URIs.
 * The first argument's _meta belongs to the resource; options._meta belongs to the content block.
 * Binary blob strings are base64; Uint8Array blobs are encoded synchronously.
 */
function resource(
  value: ResourceContentOptions,
  options: ContentOptions = {},
): DeepReadonly<EmbeddedResource> {
  return {
    ...options,
    type: "resource",
    resource:
      value.blob === undefined
        ? { ...value }
        : { ...value, blob: base64(value.blob) },
  };
}

/**
 * Typed constructors for mcpResult() content blocks. Accepts readonly inputs without mutating them.
 * Helpers perform no I/O; the server validates and copies content during result conversion.
 * Returned blocks have readonly authoring types; nested metadata is copied at server conversion.
 */
export const content = Object.freeze({
  text,
  image,
  audio,
  resourceLink,
  resource,
});
