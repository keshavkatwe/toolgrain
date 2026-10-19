# Toolgrain: agent instructions and project context

Updated: 2026-10-18

## Working agreement

- Always create a branch before making changes. Never make changes directly on `main`; continue related work on its existing PR branch.

- Never create a commit unless the user explicitly asks. Authorization applies to the requested commit, not future changes.

- We are not using gstack. Use ordinary project files for context and instructions.
- Work one step at a time with the user. The product and API are still being designed; do not treat the roadmap below as authorization to implement everything.
- This is the new Toolgrain repository. Build from scratch here, without depending on `@modelcontextprotocol/sdk`.
- Leave the previous repository at `/Users/shridhar/Documents/ChatGPT/typescript-mcp-framework` untouched. Do not copy or migrate its implementation unless requested.
- Repository cleanup and root-level Biome setup are authorized. MCP implementation, publication, and deployment remain separate steps.
- Keep confirmed decisions separate from proposals. Update this context as the user makes decisions.

## Product direction

Toolgrain is a TypeScript toolkit for building MCP servers with a simple, typed developer API. Implement MCP support directly against protocol revisions `2026-07-28` and `2025-06-18`. Owning that implementation means owning compatibility, interoperability testing, and protocol maintenance.

Toolgrain is MCP-first. `@toolgrain/mcp` owns the complete tool authoring API; validation and execution remain separate internal modules. There is no separate core package. Ease of defining and composing tools is the intended product value; SDK independence gives us control over the implementation.

## Confirmed MCP protocol target

- Support modern MCP `2026-07-28` and initialization-based MCP `2025-06-18` over stdio and HTTP, with the same tool API.
- Other protocol revisions remain unsupported; legacy initialization can negotiate down to the supported `2025-06-18` revision.
- Reference: https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro

## Naming and hosting

- Product name: Toolgrain.
- The user has created the `toolgrain` npm organization, providing the `@toolgrain` scope.
- Scoped packages are sufficient. A separate unscoped `toolgrain` package is optional and is not reserved by organization creation.
- Use GitHub and GitHub Pages. No custom domain purchase is planned.
- Current workspace names and the MCP authoring boundary are confirmed; packages remain private and unpublished.

## Confirmed developer API

The public authoring API lives in `@toolgrain/mcp`. Package name remains MCP-specific.

```ts
import { createServer, tool } from "@toolgrain/mcp";
import { stdio } from "@toolgrain/node";
import { z } from "zod";

const greet = tool({
  title: "Greeting",
  description: "Greet someone by name",
  annotations: { readOnlyHint: true },
  input: z.object({
    name: z.string().min(1),
  }),
  output: z.object({ message: z.string() }),
  async execute({ name }) {
    return { message: `Hello, ${name}!` };
  },
});

const server = createServer({
  name: "hello-server",
  version: "1.0.0",
  tools: { greet },
});

await server.listen(stdio());
```

Confirmed semantics:

- Registration keys define exposed tool names.
- Tool definitions are independent and reusable across servers.
- Input types are inferred, with runtime argument validation.
- Ordinary strings and JSON values are converted into MCP tool results.
- `mcpResult()` explicitly marks rich MCP content and result metadata; plain objects remain application data.
- Transport selection is explicit.
- Zod 4 is the initial schema library. Independence from the MCP SDK does not mean zero dependencies.

## Confirmed tool execution decisions

- The separate `@toolgrain/core` workspace is removed. Tool definitions, the registry, execution, schema conversion, and result handling live together in `packages/mcp/src/tools/`; the registry is internal. Related tests live in `packages/mcp/test/tools/`.
- `tool()` creates reusable, frozen definitions and preserves input inference. Registration requires these definitions; raw objects and modified spreads are rejected by types and at runtime. Tool and `mcpResult()` brands use structural method types and registered-symbol prototype markers, so duplicate compatible package copies interoperate.
- `tool()` accepts optional `title`, `description`, `annotations`, `icons`, `_meta`, and Zod `output` directly. No MCP wrapper is needed.
- Input validation uses asynchronous parsing; handlers receive parsed values, including defaults and transforms.
- Optional output schemas constrain handler return types and asynchronously parse returned data, including defaults and transforms. Plain results are validated directly; any supplied `mcpResult()` structured content is validated, including error data. Error results may omit structured content and use text; output defaults do not create data for these errors. Invalid output becomes a tool error without structured data. Without an output schema, any JSON structured content is allowed.
- Without an output schema, handler outputs remain unchanged before MCP result conversion. Calling a definition's `execute` property invokes the raw handler and bypasses all server validation and conversion.
- Exposed names follow the recommended 1–128 ASCII letters/digits/underscore/hyphen/dot rules, enforced at server construction with `ToolNameError`.
- `mcpResult()` supports text, image, audio, resource links, embedded text/blob resources, structured JSON, `isError`, and result `_meta`. It validates/copies content during conversion and supplies serialized text for structured content. Undefined optional envelope/content fields and optional properties parsing to undefined are absent; undefined inside unparsed data is rejected. Output parsing replaces text that serialized the original structured data. Ordinary result-shaped objects remain data.
- Unknown names use protocol errors; invalid input/output and handler failures produce tool errors. No handler context or cooperative interruption yet.
- Build ESM and declarations with TypeScript; use Vitest and compile-time type checks. CI also verifies compiled imports and declarations.

## Confirmed protocol package decisions

- `@toolgrain/protocol` is a private workspace package, version `0.0.0`, owning the unchanged upstream schema, protocol constants, provenance, and license.
- Import wire definitions and `PROTOCOL_VERSION` directly from protocol. MCP does not re-export them. Keep runtime validators and method handling in MCP.
- Protocol has no runtime dependencies and uses the same compiled dist exports, build, watch, test, and declaration checks as other packages.
- Vendored source is excluded from rewriting and verified by checksum. Protocol builds retain upstream license/provenance/schema files in dist.
- Modern wire exports remain at the package root; legacy wire types use `@toolgrain/protocol/2025-06-18`. Root exports `LEGACY_PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`, `SupportedProtocolVersion`, and shared `ProtocolResponse` envelopes. Both schemas are pinned to the same upstream commit, with separate integrity/provenance/license artifacts in sibling `src/vendor/2026-07-28/` and `src/vendor/2025-06-18/` folders.

## Confirmed MCP package decisions

- `@toolgrain/mcp` is implemented in `packages/mcp`, version `0.0.0`, private and unpublished.
- The private `@toolgrain/protocol` package owns the full official `2026-07-28` schema unchanged from commit `271ecc9accafdd9b83a3c869fa67c22953b2af80`, with checksum, provenance, and upstream license. Do not format or modify the vendored source. Updates require explicit review.
- `createServer({ name, version, tools, instructions?, onError? })` supports discovery, tool listing/calling, and `listen(transport)` / terminal, idempotent `close()`.
- Modern requests carry version and client capabilities individually. Legacy stdio uses connection-scoped `initialize` / `notifications/initialized` negotiation and supports `ping`; modern requests remain independent and can interleave. Legacy initialization negotiates `2025-06-18` and never claims modern semantics through `initialize`.
- Input schemas convert with Zod's input-mode JSON Schema 2020-12 conversion and require an object root. Output schemas use output-mode conversion. Fail unrepresentable schemas or invalid metadata at construction. Legacy listings retain supported metadata, omit icons, and advertise only object-root output schemas.
- Strings become text without an output schema; declared outputs include parsed structured content plus serialized text. Other modern JSON values become structured content plus text. Legacy structured content contains only objects; other JSON values are text only. Reject unsupported output values as tool errors.
- Input/output validation and handler failures are tool results with `isError`; unknown tools and invalid protocol messages use protocol errors.
- Modern discovery/list results use `ttlMs: 0`, `cacheScope: "private"`; discovery advertises both supported revisions. Legacy result envelopes omit modern result/cache/server-info metadata. Tool lists are a single page; nonempty cursors are rejected.
- Each MCP tool adapter reuses one internal registry. Cancellation suppresses pending responses; validation and handlers continue once registry execution starts, including cancellation during validation. Handlers receive no cancellation context.
- Keep MCP responsibilities separate: server composition, method dispatch/handlers, protocol validation/envelopes, connection lifecycle, cancellation tracking, schema conversion, execution adaptation, and result conversion.
- Keep revision-specific validation, dispatch, response shaping, and legacy negotiation in separate `modern/` and `legacy/` modules. Share tool execution, JSON normalization, schema conversion, envelope decoding, and transport lifecycle; era selection stays in thin composition modules. Modern modules must not depend on legacy modules. This separation preserves the public API and wire behavior while keeping legacy support removable.
- A runtime-independent transport contract separates message handling from framing. Tests use an in-memory adapter. Stdio is implemented separately in `@toolgrain/node`.
- Resources, prompts, multi-round-trip input-required results, subscriptions, extensions, publication, and deployment remain separate steps.

## Confirmed Node stdio decisions

- `@toolgrain/node` exports `stdio({ input?, output?, maxMessageBytes? })`, defaulting to process stdin/stdout and a 1 MiB incoming-message limit.
- Keep byte framing, writable backpressure, and transport lifecycle in separate modules. The adapter contains no MCP method handling.
- Newline-delimited UTF-8 JSON; malformed JSON/UTF-8 reports parse errors and permits later messages. Oversized frames terminate the transport.
- Close detaches listeners and pauses input without ending/destroying supplied streams or calling process.exit. EOF is the normal shutdown signal.
- `apps/stdio-example` demonstrates a full server, with subprocess tests using compiled packages over actual stdin/stdout. Inspector 2.11.0 was verified in modern protocol mode: discovery, tool listing, and greet execution over stdio pass.

## Confirmed HTTP decisions

- `@toolgrain/http` owns shared Streamable HTTP behavior and `createHttpHandler(server, options?)`, accepting Web Request and returning Promise<Response>.
- `@toolgrain/node` retains stdio and adds `createNodeHttpHandler(server, options?)`; applications own routing, ports, TLS, authentication middleware, CORS, and listener shutdown. Mount before body parsing.
- Keep the HTTP factories as composition only: split options, endpoint checks, body decoding, request/header validation, parameter-header schema extraction, execution, and response serialization. Node separates request conversion, abort lifecycle, and response writing/backpressure. Share protocol behavior through HTTP rather than duplicating it in Node; do not add a generic utility package without concrete reusable responsibilities.
- HTTP `modern/` and `legacy/` modules own each era's header, notification, status, and error-ID policies. Share endpoint/body/envelope handling, routing and parameter-header comparison, execution, and JSON serialization; choose one of the two internal adapters per request without a plugin framework.
- Both factories accept `allowedOrigins` and `maxMessageBytes` (default 1 MiB). Absent Origin is allowed; a present Origin must match the explicit allowlist, empty by default.
- Support `2026-07-28` and `2025-06-18` with independent POSTs and JSON responses. GET/DELETE return 405. No session IDs or global per-client negotiation state. Persistent sessions, resumability, SSE/progress/subscriptions, OAuth/Clerk, and identity context remain separate work.
- Validate modern protocol/method/name headers against body metadata and declared parameter-header annotations, including Base64 decoding. Legacy initialization may omit the version header; subsequent legacy POSTs carry `2025-06-18`. Optional legacy routing/parameter headers are validated when present. Invalid annotations fail HTTP-handler construction. Valid legacy initialized/cancelled notifications return 202 empty; cancellation is advisory no-op because independent requests have no session/client identity. Modern HTTP notifications remain unsupported.
- MCP exposes `handle(message, { signal?, protocolVersion? })` for independent requests and `getToolDefinitions()` for copied metadata. HTTP passes the validated revision per invocation; shared dispatch/error conversion serves stdio and HTTP. HTTP request IDs are isolated per invocation. Legacy JSON-RPC errors use HTTP 200; modern errors retain modern status rules.
- Cancellation suppresses delivery without interrupting running tool execution. Closing the server is terminal across HTTP and stdio; closing the attached transport also closes independent processing.
- Examples are separate workspaces: `http-example` (plain Node), `express-example`, `hono-example`, `elysia-example`, and `nextjs-example`. Each owns its dependencies, native dev/build/start commands, and real-process HTTP smoke test. They do not import sibling application code. Next uses the Next CLI, Elysia uses Bun, and Express/Hono use their normal Node workflows. NestJS is not separately verified.

## Repository state and next step

Protocol, MCP, Node stdio, and Streamable HTTP support are implemented. The unified tool authoring API replaces the former core package.
HTTP support and independent framework examples were merged in PR #6
(`e8e2895`) on 2026-10-16 after review and passing CI. Keep Bun 1.3.14,
pinned Turbo, root-level Biome, and shared strict TypeScript defaults.
All packages remain private and unpublished.

Dual-era compatibility verification on 2026-10-16 passes the existing tools flow
over stdio and plain Node HTTP with Inspector 2.11.0 CLI and Codex CLI/app-server
0.163.0-alpha.10.2, using Node 24.20.0. Codex works with no modern feature flag or
stdio marker by negotiating `2025-06-18`; explicit modern and mixed-client cases
also pass. Inspector checks both eras and automatic discovery. See
`docs/compatibility.md` and the manual `node scripts/verify-inspector.mjs` check.
User configuration was not changed. No commits, publication, or other roadmap
features are authorized by this implementation. Remaining roadmap items are
proposals in `ROADMAP.md` without timelines or implementation commitments.

Before changing Turborepo configuration or commands, resolve the installed `turbo` package from the relevant workspace and read its bundled `docs/README.md` and relevant documentation.

HTTP implementation and framework example review is complete. The merged scope
is independent POST requests with JSON responses, with plain Node, Express,
Hono, Elysia, and Next.js examples. Fastify support is deferred. Agree on the
next feature with the user before implementing it; sessions, SSE, resumability,
OAuth/Clerk, and identity context remain separate work. No commits, publication,
or deployment are authorized by implementation alone.

## Development loop

- Root dev is `turbo run dev --concurrency=16` without a filter: run every package/app dev task. The concurrency limit accommodates all persistent watchers and native example servers.
- Library and stdio dev tasks watch src with tsc and write JavaScript/declarations to dist. Framework/HTTP examples use native development commands after dependency builds; each HTTP dev server has a distinct port. Next build output is `.next`, not `dist`.
- All public package exports point to dist. Do not add a development/source export condition.
- Stdio Inspector is a separate example script, launching the compiled server with Bun in modern protocol mode. Reconnect after successful rebuilds to use updated compiled modules.
- Each HTTP example has an `inspect` script connecting to its running development endpoint through the shared `scripts/inspect-http.mjs` launcher. The HTTP launcher uses Bunx outside the workspace, pins Inspector to 2.11.0 in modern HTTP mode, and accepts an optional URL argument to override the endpoint. Start the application separately.
- The example has no hot-reload global server state. Keep build output separate from MCP stdout.

## Package verification

Root `bun run test:package` uses Turbo to run every workspace package verification script after its own build. CI invokes this single command; do not add per-package verification steps.

## Coverage verification

Root `bun run test:coverage` uses Turbo with each workspace's own build as a
prerequisite and caches `coverage/**` for measured packages. CI runs this instead
of plain tests. Vitest V8 includes all library source files and enforces each of
statements, branches, functions, and lines: 95% per package for MCP, Node, and HTTP.
Protocol integrity runs without coverage instrumentation. Example tests run separately through
root `bun run test:examples`, without coverage instrumentation or coverage floors. CI runs
`test:coverage` and `test:examples` together and retains example reports. CI retains coverage reports for 14 days.

CI produces workspace JSON test reports under `reports/`, restores them from
Turbo cache, and publishes a combined Actions summary and same-repository PR
comment. The comment job has no checkout and does not execute repository code.

## Package size and dependency auditing

- `bun run test:size` builds and packs the four library packages without lifecycle
  scripts or publication. It enforces packed/unpacked byte budgets from
  `package-size.config.json`, all declared export targets, every compiled module
  and declaration in `dist`, explicit required protocol artifacts, and package-file
  boundaries. Reports include the complete inventory under each package's
  `reports/size.json`; sizes exclude dependencies and retain required vendor files.
- Initial size budgets allow approximately 20% growth, rounded up to KiB.
  Intentional growth requires reviewing the relevant budget. Size checks are uncached
  and run after successful installation even if an unrelated application build fails.
- `bun run test:audit` audits the complete Bun lockfile once and writes per-workspace
  `reports/audit.json`, separating runtime and direct-workspace development scopes.
  Root tooling and examples are included. High/critical advisories and scan errors
  fail CI; low/moderate findings are reported. Scanner failures retain stderr in
  reports and logs. It does not update dependencies.
- Audit initialization discovers report destinations from `package.json` before
  loading `bun.lock`. Lockfile read/parse/metadata failures replace stale reports
  for root, libraries, and examples with errors and remove prior raw advisories.
- Auditing runs outside Turbo caching. Test tasks cache only `reports/tests.json`
  alongside coverage, preventing stale audit reports from being restored.
- CI includes sizes and advisory findings in the combined summary/PR comment and
  retains JSON reports in the existing artifact for 14 days. `bun run test:ci`
  verifies the checking and reporting scripts, running the renderer under Node.
  Malformed JSON/schema reports fail rendering after the healthy results and
  diagnostics have been written to the combined report and Actions summary.
