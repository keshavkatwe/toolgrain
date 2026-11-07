import { APPS_EXTENSION_ID, APPS_MIME_TYPE } from "@toolgrain/protocol/apps";
import type { ToolContext } from "./tools/context.js";

/** Advisory client claim; never an authorization decision. */
export type AppSupport = "supported" | "not-advertised" | "unknown";

/**
 * Read the current request's MCP Apps claim. Legacy independent HTTP has no
 * retained client capabilities and returns unknown. A claim is not verified.
 */
export function getAppSupport(ctx: ToolContext): AppSupport {
  const capabilities = ctx.request.client?.capabilities;
  if (!capabilities) return "unknown";
  const extensions = (capabilities as { extensions?: unknown }).extensions;
  if (typeof extensions !== "object" || extensions === null)
    return "not-advertised";
  const ui = (extensions as Record<string, unknown>)[APPS_EXTENSION_ID];
  if (typeof ui !== "object" || ui === null) return "not-advertised";
  const mimeTypes = (ui as { mimeTypes?: unknown }).mimeTypes;
  return Array.isArray(mimeTypes) && mimeTypes.includes(APPS_MIME_TYPE)
    ? "supported"
    : "not-advertised";
}
