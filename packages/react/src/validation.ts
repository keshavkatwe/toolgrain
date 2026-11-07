import { z } from "zod";

const jsonObject = z.record(z.string(), z.json());
const contents = z.looseObject({
  uri: z.string(),
  mimeType: z.string().optional(),
  _meta: jsonObject.optional(),
});
const content = z.discriminatedUnion("type", [
  z.looseObject({ type: z.literal("text"), text: z.string() }),
  z.looseObject({
    type: z.literal("image"),
    data: z.string(),
    mimeType: z.string(),
  }),
  z.looseObject({
    type: z.literal("audio"),
    data: z.string(),
    mimeType: z.string(),
  }),
  z.looseObject({
    type: z.literal("resource_link"),
    uri: z.string(),
    name: z.string(),
  }),
  z.looseObject({
    type: z.literal("resource"),
    resource: z.union([
      contents.extend({ text: z.string(), blob: z.never().optional() }),
      contents.extend({ blob: z.string(), text: z.never().optional() }),
    ]),
  }),
]);
export const toolResult = z.looseObject({
  content: z.array(content),
  structuredContent: z.json().optional(),
  _meta: jsonObject.optional(),
  isError: z.boolean().optional(),
});
const info = z.looseObject({ name: z.string(), version: z.string() });
const mode = z.enum(["inline", "fullscreen", "pip"]);
export const hostContext = z.looseObject({
  theme: z.enum(["light", "dark"]).optional(),
  styles: z
    .looseObject({
      variables: z.record(z.string(), z.string().optional()).optional(),
      css: z.looseObject({ fonts: z.string().optional() }).optional(),
    })
    .optional(),
  locale: z.string().optional(),
  timeZone: z.string().optional(),
  displayMode: mode.optional(),
  availableDisplayModes: z.array(mode).optional(),
  platform: z.enum(["web", "desktop", "mobile"]).optional(),
  containerDimensions: z
    .looseObject({
      width: z.number().nonnegative().optional(),
      height: z.number().nonnegative().optional(),
      maxWidth: z.number().nonnegative().optional(),
      maxHeight: z.number().nonnegative().optional(),
    })
    .optional(),
  toolInfo: z
    .looseObject({
      tool: z.looseObject({
        name: z.string(),
        inputSchema: jsonObject.and(z.object({ type: z.literal("object") })),
      }),
    })
    .optional(),
});
export const initialized = z.looseObject({
  protocolVersion: z.string(),
  hostInfo: info,
  hostCapabilities: z.looseObject({
    serverTools: z
      .looseObject({ listChanged: z.boolean().optional() })
      .optional(),
    serverResources: z
      .looseObject({ listChanged: z.boolean().optional() })
      .optional(),
  }),
  hostContext: hostContext.optional(),
});
// postMessage uses structured cloning rather than JSON serialization. Optional
// host fields can therefore retain undefined. Validate the envelope here and
// validate each known payload below, without treating optional fields as JSON data.
export const envelope = z.looseObject({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number().finite()]).optional(),
  method: z.string().optional(),
});
export const rpcError = z.looseObject({
  code: z.number().int(),
  message: z.string(),
  data: z.json().optional(),
});
export const input = z.object({ arguments: jsonObject });
export const cancellation = z.object({ reason: z.string().optional() });
export const argumentsObject = jsonObject;
