import assert from "node:assert/strict";
import {
  JSONRPC_VERSION,
  PROTOCOL_VERSION,
  UNSUPPORTED_PROTOCOL_VERSION,
} from "@toolgrain/protocol";

assert.equal(JSONRPC_VERSION, "2.0");
assert.equal(PROTOCOL_VERSION, "2026-07-28");
assert.equal(UNSUPPORTED_PROTOCOL_VERSION, -32022);
