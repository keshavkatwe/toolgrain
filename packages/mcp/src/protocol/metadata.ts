import { z } from "zod";

const object = z.record(z.string(), z.unknown());
const capabilityObject = z.record(z.string(), z.json());
const requestId = z.union([z.string(), z.number().finite()]);
const capabilities = z.looseObject({
  experimental: z.record(z.string(), capabilityObject).optional(),
  roots: object.optional(),
  sampling: z
    .looseObject({
      context: capabilityObject.optional(),
      tools: capabilityObject.optional(),
    })
    .optional(),
  elicitation: z
    .looseObject({
      form: capabilityObject.optional(),
      url: capabilityObject.optional(),
    })
    .optional(),
  extensions: z.record(z.string(), capabilityObject).optional(),
});
const implementation = z.looseObject({
  name: z.string(),
  version: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  websiteUrl: z.string().optional(),
  icons: z
    .array(
      z.looseObject({
        src: z.string(),
        mimeType: z.string().optional(),
        sizes: z.array(z.string()).optional(),
        theme: z.enum(["light", "dark"]).optional(),
      }),
    )
    .optional(),
});
export const metadata = z.looseObject({
  "io.modelcontextprotocol/protocolVersion": z.string(),
  "io.modelcontextprotocol/clientCapabilities": capabilities,
  "io.modelcontextprotocol/clientInfo": implementation.optional(),
  "io.modelcontextprotocol/logLevel": z
    .enum([
      "debug",
      "info",
      "notice",
      "warning",
      "error",
      "critical",
      "alert",
      "emergency",
    ])
    .optional(),
  progressToken: requestId.optional(),
});
