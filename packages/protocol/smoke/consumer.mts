import {
  type CallToolResult,
  type DiscoverRequest,
  PROTOCOL_VERSION,
  type ProtocolResponse,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import {
  type InitializeRequest,
  PROTOCOL_VERSION as LEGACY_PROTOCOL_VERSION,
  type CallToolResult as LegacyCallToolResult,
} from "@toolgrain/protocol/2025-06-18";
import type {
  AppHostCapabilities,
  AppHostContext,
  AppResourceCsp,
  AppResourceMeta,
  AppResourcePermissions,
  AppStyleVariableKey,
  AppStyleVariables,
  AppToolMeta,
} from "@toolgrain/protocol/apps";

const request: DiscoverRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "server/discover",
  params: {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  },
};
const result: CallToolResult = {
  resultType: "complete",
  content: [{ type: "text", text: "hello" }],
};
void request;
void result;

const initialize: InitializeRequest = {
  method: "initialize",
  params: {
    protocolVersion: LEGACY_PROTOCOL_VERSION,
    clientInfo: { name: "consumer", version: "1.0.0" },
    capabilities: {},
  },
};
const legacyResult: LegacyCallToolResult = {
  content: [{ type: "text", text: "hello" }],
  structuredContent: { message: "hello" },
};
const supportedRevision: SupportedProtocolVersion = LEGACY_PROTOCOL_VERSION;
// @ts-expect-error Other protocol revisions are not supported.
const unsupportedRevision: SupportedProtocolVersion = "2025-11-25";
void initialize;
void legacyResult;
void supportedRevision;
void unsupportedRevision;

const legacyResponse: ProtocolResponse = {
  jsonrpc: "2.0",
  id: 2,
  result: legacyResult,
};
const unknownIdError: ProtocolResponse = {
  jsonrpc: "2.0",
  id: null,
  error: { code: -32700, message: "Parse error" },
};
void legacyResponse;
void unknownIdError;

// The packed consumer matrix checks these contracts with minimum/current TypeScript.
const styleKey: AppStyleVariableKey = "--font-heading-3xl-line-height";
// @ts-expect-error Ring tokens have no tertiary variant in the reviewed contract.
const invalidStyleKey: AppStyleVariableKey = "--color-ring-tertiary";
const variables: AppStyleVariables = {
  "--color-background-primary": "#fff",
  "--font-sans": undefined,
  "--application-accent": "#657018",
};
// @ts-expect-error Extension variables also require string values.
const invalidVariables: AppStyleVariables = { "--application-accent": 1 };
const csp: AppResourceCsp = {
  connectDomains: ["https://api.example.com"] as const,
};
const permissions: AppResourcePermissions = { clipboardWrite: {} };
// @ts-expect-error Permissions are requests expressed as objects, not booleans.
const invalidPermissions: AppResourcePermissions = { camera: true };
const resourceMeta: AppResourceMeta = {
  csp,
  permissions,
  prefersBorder: false,
};
const toolMeta: AppToolMeta = {
  resourceUri: "ui://demo/view.html",
  visibility: ["app"],
};
const misplaced = { resourceUri: "ui://demo/view.html", csp };
// @ts-expect-error CSP belongs on resource metadata, even when supplied through a variable.
const invalidToolMeta: AppToolMeta = misplaced;
const capabilities: AppHostCapabilities = {
  sandbox: { csp, permissions },
  message: { text: {} },
  updateModelContext: { structuredContent: {} },
  sampling: { tools: {} },
  downloadFile: {},
  experimental: { "example.com/feature": {} },
  futureHostFeature: { enabled: true },
};
// @ts-expect-error Known content modalities must retain their wire shape.
const invalidCapabilities: AppHostCapabilities = { message: { text: true } };
const host: AppHostContext = {
  styles: { variables, css: { fonts: "@font-face {}", futureCss: "value" } },
  futureContext: true,
};
void [
  styleKey,
  invalidStyleKey,
  variables,
  invalidVariables,
  permissions,
  invalidPermissions,
  resourceMeta,
  toolMeta,
  invalidToolMeta,
  capabilities,
  invalidCapabilities,
  host,
];
