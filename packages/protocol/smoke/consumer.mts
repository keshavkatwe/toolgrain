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
