import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  JSONRPC_VERSION,
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  UNSUPPORTED_PROTOCOL_VERSION,
} from "@toolgrain/protocol";
import {
  JSONRPC_VERSION as LEGACY_JSONRPC_VERSION,
  PROTOCOL_VERSION as LEGACY_SUBPATH_VERSION,
} from "@toolgrain/protocol/2025-06-18";

assert.equal(JSONRPC_VERSION, "2.0");
assert.equal(PROTOCOL_VERSION, "2026-07-28");
assert.equal(UNSUPPORTED_PROTOCOL_VERSION, -32022);
assert.equal(LEGACY_PROTOCOL_VERSION, "2025-06-18");
assert.equal(LEGACY_SUBPATH_VERSION, LEGACY_PROTOCOL_VERSION);
assert.equal(LEGACY_JSONRPC_VERSION, JSONRPC_VERSION);
assert.deepEqual(SUPPORTED_PROTOCOL_VERSIONS, [
  PROTOCOL_VERSION,
  LEGACY_PROTOCOL_VERSION,
]);

for (const path of ["vendor/2026-07-28", "vendor/2025-06-18"]) {
  for (const name of ["schema.ts", "provenance.json", "LICENSE"]) {
    assert.deepEqual(
      readFileSync(new URL(`../dist/${path}/${name}`, import.meta.url)),
      readFileSync(new URL(`../src/${path}/${name}`, import.meta.url)),
    );
  }
}
