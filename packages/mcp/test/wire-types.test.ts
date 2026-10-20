import type {
  ClientCapabilities,
  ContentBlock,
  Icon,
  Implementation,
  LoggingLevel,
  ToolAnnotations,
} from "@toolgrain/protocol";
import type {
  ClientCapabilities as LegacyClientCapabilities,
  Implementation as LegacyImplementation,
  InitializeRequest as LegacyInitializeRequest,
} from "@toolgrain/protocol/2025-06-18";
import { expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { initializeParams } from "../src/legacy/messages.js";
import type { metadata } from "../src/modern/metadata.js";
import type { icon } from "../src/protocol/icon.js";
import type { contentBlock } from "../src/tools/content.js";
import type { toolAnnotations } from "../src/tools/schema.js";

// Hand-written Zod wire schemas must stay aligned with the vendored protocol
// types. Comparison ignores open index signatures (loose objects and records)
// and `undefined` on optional properties, which parsed JSON never contains.
type Known<T> = T extends readonly (infer Item)[]
  ? Known<Item>[]
  : T extends object
    ? [keyof T] extends [never]
      ? // The protocol's bare `object` is an open record.
        Record<never, never>
      : {
          [Key in keyof T as string extends Key
            ? never
            : number extends Key
              ? never
              : Key]: Known<Exclude<T[Key], undefined>>;
        }
    : T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Every nested field path, including those of each union member. */
type Paths<T> = T extends readonly (infer Item)[]
  ? Paths<Item>
  : T extends object
    ? {
        [Key in keyof T & string]-?: Key | `${Key}.${Paths<T[Key]>}`;
      }[keyof T & string]
    : never;
/** Mutually assignable with identical field paths, so new protocol fields fail. */
type Aligned<Schema, Protocol> =
  Same<Known<Schema>, Known<Protocol>> extends true
    ? Same<Paths<Known<Schema>>, Paths<Known<Protocol>>>
    : false;
type Content<Type extends ContentBlock["type"]> = Aligned<
  Extract<z.output<typeof contentBlock>, { type: Type }>,
  Extract<ContentBlock, { type: Type }>
>;
type Metadata = z.output<typeof metadata>;
type LegacyInitialize = z.output<typeof initializeParams>;

it("keeps tool content and metadata schemas aligned with the protocol", () => {
  expectTypeOf<Content<"text">>().toEqualTypeOf<true>();
  expectTypeOf<Content<"image">>().toEqualTypeOf<true>();
  expectTypeOf<Content<"audio">>().toEqualTypeOf<true>();
  expectTypeOf<Content<"resource_link">>().toEqualTypeOf<true>();
  expectTypeOf<Content<"resource">>().toEqualTypeOf<true>();
  expectTypeOf<Aligned<z.output<typeof icon>, Icon>>().toEqualTypeOf<true>();
  expectTypeOf<
    Aligned<z.output<typeof toolAnnotations>, ToolAnnotations>
  >().toEqualTypeOf<true>();
});

it("keeps modern request metadata aligned with the protocol", () => {
  type Capabilities = Metadata["io.modelcontextprotocol/clientCapabilities"];
  type ClientInfo = NonNullable<Metadata["io.modelcontextprotocol/clientInfo"]>;
  type LogLevel = NonNullable<Metadata["io.modelcontextprotocol/logLevel"]>;
  expectTypeOf<
    Aligned<Capabilities, ClientCapabilities>
  >().toEqualTypeOf<true>();
  expectTypeOf<Aligned<ClientInfo, Implementation>>().toEqualTypeOf<true>();
  expectTypeOf<LogLevel>().toEqualTypeOf<LoggingLevel>();
});

it("keeps legacy initialization parameters aligned with the protocol", () => {
  type Params = LegacyInitializeRequest["params"];
  // Omit after normalizing; Omit on an index-signature type drops named keys.
  expectTypeOf<
    Aligned<Omit<Known<LegacyInitialize>, "_meta">, Params>
  >().toEqualTypeOf<true>();
  expectTypeOf<
    Aligned<LegacyInitialize["capabilities"], LegacyClientCapabilities>
  >().toEqualTypeOf<true>();
  expectTypeOf<
    Aligned<LegacyInitialize["clientInfo"], LegacyImplementation>
  >().toEqualTypeOf<true>();
});
