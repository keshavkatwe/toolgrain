/** Native Apps 2026-01-26 wire contracts. Reviewed specification and upstream
 * type references are pinned in apps-provenance.json. Toolgrain authors these
 * declarations directly; browser implementations live in @toolgrain/react.
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
  /** Resource configuration belongs on the returned HTML content item's `_meta.ui`. */
  csp?: never;
  /** Resource configuration belongs on the returned HTML content item's `_meta.ui`. */
  permissions?: never;
}
/** Origins requested by a resource; the host constructs and enforces its CSP. */
export interface AppResourceCsp {
  connectDomains?: readonly string[];
  resourceDomains?: readonly string[];
  frameDomains?: readonly string[];
  baseUriDomains?: readonly string[];
}
/** Requested browser permissions; empty objects request access without guaranteeing a grant. */
export interface AppResourcePermissions {
  camera?: Record<string, never>;
  microphone?: Record<string, never>;
  geolocation?: Record<string, never>;
  clipboardWrite?: Record<string, never>;
}
/** Requested sandbox configuration on a resource content item's `_meta.ui`. */
export interface AppResourceMeta {
  csp?: AppResourceCsp;
  permissions?: AppResourcePermissions;
  domain?: string;
  /** Request a host-provided border/background; omission leaves the choice to the host. */
  prefersBorder?: boolean;
}
/** Display modes of the iframe view. */
export type AppDisplayMode = "inline" | "fullscreen" | "pip";
/** Host color-scheme preference. */
export type AppTheme = "light" | "dark";
/** Standardized Apps theme tokens; custom host variables may also be supplied. */
export type AppStyleVariableKey =
  | `--color-${"background" | "text" | "border"}-${
      | "primary"
      | "secondary"
      | "tertiary"
      | "inverse"
      | "ghost"
      | "info"
      | "danger"
      | "success"
      | "warning"
      | "disabled"}`
  | `--color-ring-${"primary" | "secondary" | "inverse" | "info" | "danger" | "success" | "warning"}`
  | `--font-${"sans" | "mono"}`
  | `--font-weight-${"normal" | "medium" | "semibold" | "bold"}`
  | `--font-text-${"xs" | "sm" | "md" | "lg"}-${"size" | "line-height"}`
  | `--font-heading-${"xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl"}-${"size" | "line-height"}`
  | `--border-radius-${"xs" | "sm" | "md" | "lg" | "xl" | "full"}`
  | "--border-width-regular"
  | `--shadow-${"hairline" | "sm" | "md" | "lg"}`;
/** Optional known tokens with string-valued extensions for forward compatibility. */
export type AppStyleVariables = Partial<
  Record<AppStyleVariableKey, string | undefined>
> &
  Record<string, string | undefined>;
/** Host font-loading CSS applied by the React provider when host styling is enabled. */
export interface AppHostCss {
  fonts?: string;
  [key: string]: unknown;
}
/** Host-provided theme variables and font-loading CSS. */
export interface AppHostStyles {
  variables?: AppStyleVariables;
  css?: AppHostCss;
  [key: string]: unknown;
}
/** Host-provided presentation hints. These are not verified identity or policy. */
export interface AppHostContext {
  theme?: AppTheme;
  styles?: AppHostStyles;
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
/** Content kinds a host advertises for an optional action; this declares no React action API. */
export interface AppContentModalities {
  text?: Record<string, unknown>;
  image?: Record<string, unknown>;
  audio?: Record<string, unknown>;
  resource?: Record<string, unknown>;
  resourceLink?: Record<string, unknown>;
  structuredContent?: Record<string, unknown>;
}
/** Capabilities negotiated by the host on the iframe channel. */
export interface AppHostCapabilities {
  experimental?: Record<string, object>;
  serverTools?: { listChanged?: boolean };
  serverResources?: { listChanged?: boolean };
  openLinks?: Record<string, unknown>;
  downloadFile?: Record<string, unknown>;
  logging?: Record<string, unknown>;
  sandbox?: {
    permissions?: AppResourcePermissions;
    csp?: AppResourceCsp;
  };
  updateModelContext?: AppContentModalities;
  message?: AppContentModalities;
  sampling?: { tools?: Record<string, unknown> };
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

/** User message submitted through the host; sending can trigger a model follow-up. */
export interface AppMessageParams {
  role: "user";
  content: readonly ContentBlock[];
}
/** Replacement context for future model turns. An empty object can clear prior app context. */
export interface AppModelContextParams {
  content?: readonly ContentBlock[];
  structuredContent?: Record<string, unknown>;
}
/** Full host acknowledgement; explicit denials may resolve with isError. RPC errors reject. */
export interface AppActionResult {
  isError?: boolean;
  [key: string]: unknown;
}
/** Actual display mode selected by the host, which can differ from the requested mode. */
export interface AppDisplayModeResult {
  mode: AppDisplayMode;
  [key: string]: unknown;
}
