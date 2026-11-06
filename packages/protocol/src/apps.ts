/** Native wire contracts derived from SEP-1865, stable revision 2026-01-26.
 * Source: https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx
 * Toolgrain-authored declarations; no upstream implementation is vendored.
 */
import type {
  ContentBlock,
  Implementation,
  MetaObject,
  Tool,
} from "./index.js";

/** Apps iframe revision; independent of the outer MCP connection revision. */
export const APPS_PROTOCOL_VERSION = "2026-01-26";
/** Client capability extension identifier. */
export const APPS_EXTENSION_ID = "io.modelcontextprotocol/ui";
/** HTML resource MIME type required by MCP Apps. */
export const APPS_MIME_TYPE = "text/html;profile=mcp-app";

/** UI association and host-enforced visibility on a tool's `_meta.ui`. */
export interface AppToolMeta {
  resourceUri?: string;
  visibility?: readonly ("model" | "app")[];
}
/** Requested sandbox configuration on a resource content item's `_meta.ui`. */
export interface AppResourceMeta {
  csp?: {
    connectDomains?: readonly string[];
    resourceDomains?: readonly string[];
    frameDomains?: readonly string[];
    baseUriDomains?: readonly string[];
  };
  permissions?: {
    camera?: Record<string, never>;
    microphone?: Record<string, never>;
    geolocation?: Record<string, never>;
    clipboardWrite?: Record<string, never>;
  };
  domain?: string;
  prefersBorder?: boolean;
}
/** Display modes of the iframe view. */
export type AppDisplayMode = "inline" | "fullscreen" | "pip";
/** Host-provided presentation hints. These are not verified identity or policy. */
export interface AppHostContext {
  theme?: "light" | "dark";
  styles?: {
    variables?: Record<string, string | undefined>;
    css?: { fonts?: string };
  };
  locale?: string;
  timeZone?: string;
  displayMode?: AppDisplayMode;
  availableDisplayModes?: AppDisplayMode[];
  containerDimensions?: {
    width?: number;
    maxWidth?: number;
    height?: number;
    maxHeight?: number;
  };
  platform?: "web" | "desktop" | "mobile";
  deviceCapabilities?: { touch?: boolean; hover?: boolean };
  safeAreaInsets?: { top: number; right: number; bottom: number; left: number };
  userAgent?: string;
  toolInfo?: { id?: string | number; tool: Tool };
  [key: string]: unknown;
}
/** Capabilities negotiated by the host on the iframe channel. */
export interface AppHostCapabilities {
  serverTools?: { listChanged?: boolean };
  serverResources?: { listChanged?: boolean };
  openLinks?: Record<string, unknown>;
  logging?: Record<string, unknown>;
  [key: string]: unknown;
}
/** Tool envelope delivered by the host; structured data can be omitted by legacy conversion. */
export interface AppToolResult<Structured = unknown, Meta = MetaObject> {
  content: ContentBlock[];
  structuredContent?: Structured;
  _meta?: Meta;
  isError?: boolean;
  [key: string]: unknown;
}
/** View-to-host Apps handshake parameters. */
export interface AppInitializeParams {
  protocolVersion: typeof APPS_PROTOCOL_VERSION;
  appInfo: Implementation;
  appCapabilities: { availableDisplayModes?: AppDisplayMode[] };
}
/** Host-to-view Apps handshake response. */
export interface AppInitializeResult {
  protocolVersion: string;
  hostInfo: Implementation;
  hostCapabilities: AppHostCapabilities;
  hostContext?: AppHostContext;
}
