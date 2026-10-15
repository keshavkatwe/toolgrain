import {
  type CallToolResult,
  type DiscoverRequest,
  PROTOCOL_VERSION,
} from "@toolgrain/protocol";

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
