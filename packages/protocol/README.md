<a href="https://github.com/keshavkatwe/toolgrain#readme">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/keshavkatwe/toolgrain/main/brand/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/keshavkatwe/toolgrain/main/brand/logo-light.svg">
    <img src="https://raw.githubusercontent.com/keshavkatwe/toolgrain/main/brand/logo-light.svg" alt="Toolgrain" width="200" height="48">
  </picture>
</a>

# @toolgrain/protocol

**MCP wire types, with provenance.**

Pinned protocol definitions and version constants for Toolgrain, with no runtime
dependencies. Tool authoring lives in `@toolgrain/mcp`.

[Documentation](https://toolgrain.mintlify.site/reference/protocol) ·
[Examples](https://toolgrain.mintlify.site/examples) ·
[npm](https://www.npmjs.com/package/@toolgrain/protocol)

## Installation

Install matching stable versions across Toolgrain libraries. These commands
resolve npm's `latest` tag.

```sh
npm install @toolgrain/protocol
```

## Protocol versions and wire types

```ts
import {
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  type CallToolResult,
} from "@toolgrain/protocol";
import {
  PROTOCOL_VERSION as LEGACY_PROTOCOL_VERSION,
  type InitializeRequest,
} from "@toolgrain/protocol/2025-06-18";

const result: CallToolResult = {
  resultType: "complete",
  content: [{ type: "text", text: "Hello!" }],
};

console.log(PROTOCOL_VERSION); // 2026-07-28
console.log(LEGACY_PROTOCOL_VERSION); // 2025-06-18
console.log(SUPPORTED_PROTOCOL_VERSIONS);
console.log(result);

export type LegacyInitialization = InitializeRequest;
```

The root exports the modern schema, `LEGACY_PROTOCOL_VERSION`,
`SUPPORTED_PROTOCOL_VERSIONS`, `SupportedProtocolVersion`, and shared
`ProtocolResponse` envelopes. The `2025-06-18` subpath exports the legacy schema.
These are wire definitions; runtime validation remains in `@toolgrain/mcp`.

## MCP Apps contracts

The `@toolgrain/protocol/apps` subpath describes the Apps iframe channel,
independently of either outer MCP revision. It exports the Apps version,
extension identifier, HTML MIME type, resource/tool metadata, host context,
capabilities, initialization envelopes, and tool-result envelope.

The `0.3.0-alpha.3` candidate also exports `AppMessageParams`,
`AppModelContextParams`, `AppActionResult`, and `AppDisplayModeResult` for native
host requests. They describe user messages, replacement model context, full
acknowledgements, and actual selected display modes. These new exports are absent
from published `0.3.0-alpha.2`.

`AppResourceMeta` describes CSP, requested browser permissions, sandbox origin,
and border preference. Tool `_meta.ui` uses `AppToolMeta` for `resourceUri` and
visibility; CSP and permissions belong on the resource content item.

The `0.3.0-alpha.3` candidate adds named resource CSP/permission, host styling,
theme-token, and content-modality types. They are not additional
browser actions in the published `0.3.0-alpha.2`. Known styling tokens support
autocomplete while custom variables and unknown host capability fields remain
accepted for forward compatibility.

The package retains `dist/apps-provenance.json` with exact reviewed specification
and upstream type-file commits/checksums. The declarations are Toolgrain-authored;
no Apps SDK implementation is vendored and there are no runtime dependencies.
See the [Apps API reference](https://toolgrain.mintlify.site/mcp-apps/reference).

## Requirements

ESM only. Supported application runtimes are Node.js `^24.20.0` or Bun
`>=1.4.4 <2`. TypeScript requires 5.5.4 or later with `strict` enabled. See the
[support policy](https://toolgrain.mintlify.site/project/support-policy).

## Upstream provenance and licensing

Both schemas are pinned to upstream commit
`271ecc9accafdd9b83a3c869fa67c22953b2af80`. The package retains each unchanged
`schema.ts`, `provenance.json`, and `LICENSE` under `dist/vendor/<revision>/`.
Upstream JSON Schemas are test fixtures and are excluded from the package.

The upstream license describes a transition from MIT to Apache-2.0, with
different terms applying to different contributions. It does not offer a free
choice of MIT or Apache-2.0 for all upstream code. Preserve the complete
[pinned upstream license](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/271ecc9accafdd9b83a3c869fa67c22953b2af80/LICENSE).

Toolgrain-owned code is MIT licensed, copyright 2026 Keshav Katwe. The
[package LICENSE](https://github.com/keshavkatwe/toolgrain/blob/main/packages/protocol/LICENSE)
and [NOTICE](https://github.com/keshavkatwe/toolgrain/blob/main/packages/protocol/NOTICE)
explain the boundary between Toolgrain's code and the vendored material. The
package uses `SEE LICENSE IN LICENSE` metadata to describe these combined terms.
