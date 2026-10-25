# Toolgrain: agent instructions and project context

Updated: 2026-10-25

## Working agreement

- Always create a branch before making changes. Never make changes directly on `main`; continue related work on its existing PR branch.

- Never create a local agent commit unless the user explicitly asks. Authorization applies to the requested commit, not future changes. The approved Changesets workflow may create bot version commits and Release PRs; merging a reviewed Release PR approves its automated publication, tags, and package releases after green release verification. This exception does not authorize local agent commits or auto-merging.

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
- Current workspace names and the MCP authoring boundary are confirmed. All six
  libraries are published on npm as stable `0.1.0` under `latest`. GitHub release
  [v0.1.0](https://github.com/keshavkatwe/toolgrain/releases/tag/v0.1.0) is stable
  and marked Latest at `526ea39`. RC0 remains available by exact version or
  `@next`, with its separate GitHub prerelease at `3d56379`.
- Package release preparation includes descriptions, repository/homepage/issue links, keywords, and package-local READMEs for all six libraries. Stable installation commands pin `0.1.0`. On 2026-10-23 the user chose MIT for Toolgrain-owned code with copyright attribution to Keshav Katwe. Root/package license files preserve that grant; vendored protocol material retains its unchanged upstream terms. Five library manifests declare `MIT`; protocol uses `SEE LICENSE IN LICENSE` with a package-root explanation and NOTICE covering its mixed contents. Public npm configuration, RC0, and stable publication are complete; future publications require their own approval.
- The `standardwebhooks@1.1.1` licensing question is resolved: its exact npm source commit `b4d2c14fc5b4ccff3ff271e3b087dff812254c59` retains an MIT `libraries/LICENSE`, copyright (c) 2023 Svix, introduced alongside the JavaScript library. Its `timing_safe_equal.ts` also carries the Deno authors' 2018-2022 MIT attribution. The upstream npm archive omits that parent license and source attribution; `packages/clerk/NOTICE` preserves both notices and full MIT texts with provenance, and must be included in the Clerk archive. No dependency/implementation changes or external contact were required. Renew the notice review when changing the dependency release.

## Confirmed brand kit

- On 2026-10-23 the user approved the Monolith logo mark, wordmark, lockup,
  colors, typography, and motion direction. `brand/` is the shared source for
  editable artwork, outlined SVG exports, design tokens, provenance, and usage.
- Reuse these assets rather than recreating the logo. Preserve the bundled
  Manrope font's OFL and FONTLOG files. Toolgrain-owned artwork follows MIT.
- Website implementation is in open [PR #28](https://github.com/keshavkatwe/toolgrain/pull/28).
  Review/merge, deployment, and broader asset rollout remain separate steps.

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
- Zod 4 is the initial schema library. Classic and Mini user schemas are accepted through `zod/v4/core`; internal protocol, metadata, and content validators remain Classic. Independence from the MCP SDK does not mean zero dependencies.
- The MCP authoring API's minimum supported TypeScript version is 5.5.4 with strict mode; its Zod peer floor is 4.6.6.

## Confirmed tool execution decisions

- The separate `@toolgrain/core` workspace is removed. Tool definitions, the registry, execution, schema conversion, and result handling live together in `packages/mcp/src/tools/`; the registry is internal. Related tests live in `packages/mcp/test/tools/`.
- The internal registry is non-generic: listings use general schema types and execution returns `Promise<unknown>`. Public `tool()` inference and schema checks remain unchanged; the registry still validates inputs, checks cancellation, and invokes the matching handler.
- `tool()` creates reusable, frozen definitions and preserves input inference. Registration requires these definitions; raw objects and modified spreads are rejected by types and at runtime. Tool and `mcpResult()` brands use structural method types and registered-symbol prototype markers, so duplicate compatible package copies interoperate.
- Tool variants created with `tool({ ...definition, ...changes })` preserve input/output schema types and output presence, and recheck the handler against changed schemas. Readonly content, icons, and nested protocol arrays are accepted as authoring inputs; wire conversion still validates and copies them.
- `tool()` accepts optional `title`, `description`, `annotations`, `icons`, `_meta`, and Zod `output` directly. No MCP wrapper is needed.
- Input validation uses asynchronous parsing; handlers receive parsed values, including defaults and transforms.
- Optional output schemas constrain handler return types and asynchronously parse returned data, including defaults and transforms. Plain results are validated directly; any supplied `mcpResult()` structured content is validated, including error data. Error results may omit structured content and use text; output defaults do not create data for these errors. Invalid output becomes a tool error without structured data. Without an output schema, any JSON structured content is allowed.
- Successful rich results with an output schema require structured content in their public types as well as at runtime. `McpStructuredResult<T>` supports explicitly typed helpers; text-only `isError: true` results remain valid.
- Without an output schema, handler outputs remain unchanged before MCP result conversion. Calling a definition's `execute` property invokes the raw handler and bypasses all server validation and conversion.
- Ordinary non-string results are JSON-validated once in `structuredResult()` before serialization. Explicit results retain strict structured-content validation separately from omission-tolerant envelope validation.
- Exposed names follow the recommended 1–128 ASCII letters/digits/underscore/hyphen/dot rules, enforced at server construction with `ToolNameError`.
- `mcpResult()` supports text, image, audio, resource links, embedded text/blob resources, structured JSON, `isError`, and result `_meta`. It validates/copies content during conversion and supplies serialized text for structured content. Undefined optional envelope/content fields and optional properties parsing to undefined are absent; undefined inside unparsed data is rejected. Output parsing replaces text that serialized the original structured data. Ordinary result-shaped objects remain data.
- Unknown names use protocol errors; invalid input/output and handler failures produce tool errors. Handlers receive a `ToolContext`; see the handler context section below.
- Confirmed on 2026-10-22: valid explicit `mcpResult({ isError: true, ... })` results and ordinary input validation feedback remain public. Unexpected parsing, handler/provider, and output failures produce generic `Tool execution failed` results without structured content. `onError(error, details?)` receives the original thrown value and frozen `ToolErrorDetails { toolName, request }` for unexpected tool failures; `request` is the existing frozen `ToolRequest`. Arguments and auth identity/credentials are not added. Transport/internal request diagnostics retain their one-argument form. Existing single-argument callbacks remain valid; synchronous throws and asynchronous rejections from diagnostics cannot disrupt responses/cleanup. Expected validation/protocol/explicit tool errors are not reported. Cancelled late failures remain suppressed. Direct handlers/accessors keep raw behavior.
- Build ESM and declarations with TypeScript; use Vitest and compile-time type checks. CI also verifies compiled imports and declarations.
- MCP emits external JavaScript source maps and declaration maps and packages `src/**/*.ts` alongside `dist`. Public exports remain compiled files in `dist`; sources support debugging and editor navigation. Other libraries retain their existing output policies.

## Confirmed handler context design

Agreed with the user on 2026-10-19 and implemented in PR #14.

- Handlers receive a second argument, `execute(input, ctx)`, typed `ToolContext`. This is additive: handlers that take only `input` remain valid.
- v0 `ctx` is `{ signal, request: { id, protocolVersion, client?, meta } }`. `signal` is an `AbortSignal`. `request.client` is `{ info?, capabilities? }` and is absent where the era and transport provide no client information (for example legacy HTTP). `request.meta` is a deeply frozen copy of the request's `_meta`. Each request gets its own deeply frozen copy of `client` too, so handlers cannot affect one another. Client details are self-reported and unverified. The shape is the same for stdio and HTTP and for both protocol eras.
- Client info and capabilities have recursive readonly types, including nested arrays, matching their existing runtime freezing. `toolContext()` accepts mutable construction inputs and existing readonly client views. `AbortSignal` and unknown metadata values keep their existing types.
- Client info and capabilities are typed as unions of the modern and legacy protocol types. Legacy details retain their reported values without normalization. `ToolRequest` stays a single shape, so checking `protocolVersion` does not narrow these unions; handlers must guard fields that differ between eras.
- If the signal has aborted by the time input validation finishes, the handler is not started.
- `ctx` is required in the handler type. Direct `execute` calls (for example in tests) build one with an exported `toolContext({ signal?, request? })` helper. It defaults each omitted or undefined field separately: id `0`, the modern revision, no client, and empty meta.
- Docs and examples name the parameter `ctx` and the type `ToolContext`.
- `toolContext()` is the supported way to construct a context. Future `ctx` fields may be required on `ToolContext`, with `toolContext()` supplying them, so handlers never need optional chaining; hand-built contexts are not a compatibility promise.
- `ToolRequest` stays a single shape with optional `client`, not a union keyed on `protocolVersion`, so legacy support remains removable. Once legacy is removed, `client` can become required without breaking handlers that only read it.
- Cancellation is cooperative and documented as such: a handler that ignores the signal keeps running, its response is discarded, and on stdio its request ID stays reserved until it settles. Per-tool timeouts may be considered later if users need them.
- Proposals deferred to the elicitation design: a helper such as `requireCapability(ctx, "elicitation")` that produces `MissingRequiredClientCapability` (`-32021`), read-only `inputResponses`/`requestState` on `ctx.request`, an `inputRequired()` result helper, and possibly a higher-level `ctx.elicit()`.
- Progress and elicitation through multi-round-trip input requests remain later additive fields. Identity/auth uses the accessors described below. No `ctx.log` is planned because MCP logging is deprecated in `2026-07-28`.
- Confirmed after user review on 2026-10-19: the signal aborts on stdio `notifications/cancelled`, on the `handle()` caller's signal (HTTP disconnect), on transport close including stdin EOF, and on server close. `signal.reason` is a `DOMException` `AbortError`: "Request cancelled by client" for stdio cancellation, "Connection closed" for stdio requests when the connection closes (including through `server.close()`), "Server closed" for `handle()` calls when the server or attached transport closes, or otherwise the `handle()` caller's own reason. Results and failures after an abort are discarded without reporting, as responses already were. Close is re-entrant: abort listeners that call `server.close()` reuse the pending close. Internally a per-request `RequestScope { signal, client? }` replaces the former `isActive` callback; legacy stdio stores client details after a successful `initialize`.

## Confirmed authorization decisions

Implemented after user approval on 2026-10-21; included in published `0.1.0`.

- Configure HTTP endpoint authorization with `createServer({ auth })`. Shared `AuthProvider<T>` and `AuthError` live in MCP; `@toolgrain/jwt` and `@toolgrain/clerk` implement the interface. Tools remain standalone and `ToolContext` remains non-generic.
- Unexpected authorization failures, including provider `temporarily_unavailable` errors, reach `onError` once with the original thrown value and no request details. Expected auth rejections and cancelled/late failures remain unreported; diagnostics cannot disrupt responses or cleanup.
- JWT and Clerk audience failures retain `invalid_token`/401 and provide explicit public `error_description` guidance in JSON and Bearer challenges, distinguishing missing `aud` from a mismatch and identifying the expected resource. Shared `validateTokenAudience()` runs only after token verification; actual token claims and raw provider errors stay private. Custom providers may opt into a public `AuthError` description while retaining a private cause.
- Each integration exports synchronous, provider-specific `useAuth(ctx)`. Verification is eager, before body parsing and tool work. Identities are copied and deeply frozen per request, with typed standard JWT claims or Clerk `{ userId, clientId, scopes }`; custom JWT claims remain unknown. Raw credentials and Clerk SDK methods are not exposed.
- `resource` is optional: HTTP adapters infer it from a validated public request URL, excluding queries and preserving the endpoint path. Metadata, challenges, and audience checks use that same resource. HTTP adapters validate hosts before routing/auth/body parsing. `allowedHosts` contains exact authorities with optional ports, with loopback defaults; `allowedOrigins` is separate. Applications configure production hosts and normalize public URLs through trusted proxy middleware. Explicit resource overrides remain available. Node preserves the real request target/host/direct TLS scheme and ignores forwarded headers.
- JWT verifies signatures with jose, exact issuer, resource audience, expiration, and not-before. Audience arrays contain only strings; NumericDate claims are finite. Unsupported token critical headers yield invalid_token/401, while trusted signing-key/crypto failures remain provider outages/503. `issuer` is required; `jwksUrl` is an optional override for discovery. Keys rotate/cache; default algorithms are RS256/ES256, and only asymmetric algorithms are allowed. Clerk derives issuer from its publishable key, verifies OAuth JWTs and opaque tokens, and rejects sessions/API keys/M2M tokens. Clerk publishable and secret keys are required.
- Combined Web and Node HTTP handlers default to `/mcp` and automatically route public GET/HEAD protected-resource metadata when auth is configured. Mount combined handlers at the application root. Explicit metadata factories remain available for filesystem routers and apply the same host validation. Auth HTTP status rules apply equally in both protocol eras. Bearer headers are the only credential source; query tokens are rejected.
- `server.listen()` accepts message `Transport` and independent `RequestTransport` contracts. Auth-configured servers accept request transports such as Node `http()` and reject message transports such as stdio before startup. One transport may attach; each transport instance is claimed once before startup, across compatible package copies, without mutating frozen custom transports. A rejected second attachment leaves the owner running and the other server free to attach a fresh transport. Close remains terminal, idempotent, and re-entrant across both contracts. `authorize(token, { resource, signal? })` produces a server-bound, single-use scope passed to `handle({ ... }, { auth })` and disposed in `finally`. Verification, body reading, and tool execution observe cancellation and server close; late verification results are discarded.
- Token issuance/login/consent/client registration and per-tool scope policies remain separate work. Lazy context providers are described below; authorization remains eagerly verified before lazy provider work.
- `apps/elysia-example` also offers an explicitly protected Clerk variant: `dev:clerk` / `start:clerk` on loopback port 3007, `inspect:clerk`, and a standalone `whoAmI` tool. The complete protected teaching example (keys, both tools, server, and Elysia startup) lives in `src/clerk.ts`; its direct-run guard allows tests to import it without opening a listener. Keys load from the workspace's ignored `.env.local`; missing keys fail startup. The ordinary Elysia/root dev flow remains on port 3003 without credentials. Its README documents manual public-client PKCE setup in Inspector; live Clerk login needs local keys and OAuth application configuration.
- See `docs/authorization.md` and `apps/jwt-example`. New adapter packages use the same 95% coverage and compiled export/consumer verification as existing libraries, including TypeScript 5.5.4 and Zod 4.6.6 declaration consumers.

## Confirmed lazy context provider decisions

Approved and implemented on 2026-10-21; included in published `0.1.0`.

- `createContext({ name, resolve(ctx) })` lives in `@toolgrain/mcp` and infers a `ContextProvider<Awaited<Value>>`. Export `provider.use` as an application-specific accessor such as `useDatabase`; accessors always return promises, even for synchronous resolvers. `ToolContext` remains non-generic, and existing synchronous `useAuth(ctx)` is unchanged.
- Register explicit `context: [services, database]` arrays on `createServer()` or `toolContext()`. Order does not matter. Dependencies resolve through accessor calls, without `dependsOn` or automatic registration. Factories start only on access after authorization/input validation; discovery, listings, invalid input, unknown tools, and unused providers do no work.
- One cache per tool context shares a promise/value or failure per provider, including concurrent calls. New requests and new `toolContext()` calls get new caches, regardless of request IDs. Reusing a direct-call context reuses its cache. No global request map, Node async hooks, or server-wide value caching is used.
- Definitions and registration snapshots are immutable. Providers have opaque identities with stable structural branding and registered-symbol context state for compatible package copies. Names are nonempty diagnostic labels, not keys. Duplicate bindings for one identity fail construction; distinct definitions may share a name. Raw definitions/spreads are not registrations.
- `provider.provide(resolver)` creates a typed binding for the original identity without mutation. Register the override instead of the original. Original accessors find that binding; separate server/context overrides remain isolated.
- Dependency-aware context views retain the same request data, signal, and frozen verified auth identity. Track the pending dependency graph across asynchronous factories; reject direct, indirect, and concurrently started cycles with a diagnostic chain, while allowing shared dependency diamonds. Resolve and await dependencies inside factories; returned methods can use the resolved values.
- Missing providers reject on access; factory errors use existing tool-error behavior. TypeScript checks inferred values and overrides, not registration completeness for standalone tools. Accessors reject unsupported hand-written contexts.
- Cancellation checks run before access, before factory startup, and after resolution. Provider work is cooperative through `ctx.signal`; ignored cancellation may keep a factory running, while late values/responses are suppressed as before.
- Provider values are returned unchanged and may contain mutable clients, class instances, or functions. Application-owned pools/resources remain application-owned. Automatic disposal, transactions, cleanup hooks, lifecycle hooks, synchronous provider accessors, and background-work support are outside this version.
- See `docs/context.md`. Coverage and compiled consumer checks retain the existing 95% floor and TypeScript 5.5.4/Zod 4.6.6 compatibility requirements. Implementation alone does not authorize commits or publication.

## Confirmed runtime and dependency support policy

Adopted on 2026-10-22; see `docs/support-policy.md` and `support-policy.json`.

- All six libraries declare Node `^24.20.0` and Bun `>=1.4.4 <2` separately.
  Bun 1.3.14 cannot report Node HTTP disconnects; the supported application runtime
  starts at 1.4.4. Keep repository Bun pinned at 1.3.14.
  TypeScript remains strict 5.5.4 minimum;
  Zod remains `^4.6.6`. Node 26 is preview until explicitly promoted after LTS
  and passing checks. Other runtimes/package managers have no support commitment.
- CI retains the complete baseline and adds real packed npm/Node and Bun/Bun
  consumers on Linux, macOS and Windows. Every library checks minimum/current
  declarations with `skipLibCheck: false`. Hosted combinations need passing runs
  before being called verified. Bun functional coverage does not waive Node's
  existing source-map stack assertion; mapped stacks are currently Node-specific.
- Weekly checks cover intermediate TypeScript minors/current Zod 4 and stable
  dependency drift. Prerelease/Node-26 probes are informational. Stable supported
  regressions block release. CI probes change only disposable checkouts.
- Review dependency updates monthly, urgent security fixes sooner. Preserve exact
  pins and reviewed lockfiles. Runtime, peer and declaration floors are upgrade
  gates, including transitive changes. Minimum increases/removals are breaking:
  minor in 0.x, major from 1.0; give 90 days and one release of removal notice,
  whichever is longer, except documented security emergencies. Runtime retirement
  requires explicit review around upstream EOL. Protocol/schema updates remain
  separate reviewed work. No commit/publication is authorized by implementation.

## Confirmed versioning and release policy

Adopted on 2026-10-23; automation format updated by the user on 2026-10-25.
After explicit user approval, PR #34 merged into main as `b7b4b86` on
2026-10-25. Automation is active and its first hosted no-op run passed. The
first real bot Release PR and publication cycle remain unverified; see the
merged-automation record below.

- All six library manifests and published npm libraries share stable `0.1.0`.
  Changesets 3.0.3 owns release planning, version selection, dependencies, and
  package-local changelogs. Its fixed group lists only those six libraries;
  examples/tooling are ignored. The root changelog preserves historical notes.
  The user selected native package changelogs and package-scoped GitHub releases,
  superseding the earlier shared changelog and single-release policy.
- On pushes to main, Changesets Action v2.1.2 selects version/publish/no-op mode.
  Pending records create/update the bot's `changeset-release/main` Release PR.
  `release:version` runs Changesets and synchronizes only Bun workspace version
  metadata. The bot may commit those generated changes and open/update its PR.
  Local agent commits still require an explicit user request.
- Review versions, dependencies, consumed records, changelogs, Bun metadata, and
  CI before merging the Release PR. That merge approves automatic publication,
  package tags and GitHub releases after full supported verification on the
  exact merged commit. No auto-merge or separate manual publish confirmation.
  GitHub may require approving bot-created PR workflow runs with GITHUB_TOKEN.
  The Actions setting allowing bot PR creation was enabled and read back on
  2026-10-25; default workflow permissions remain read-only.
- The native select/pack/publish artifacts and reporter own the publishing flow.
  The workflow-only npm adapter uses Bun packing for workspace dependency
  rewriting and runs pinned npm registry/publish calls outside the checkout.
  It does not plan versions or generate release notes. Only the publish job
  receives OIDC permission; no npm token is introduced.
- During `0.x`, compatible fixes use patch records; features and breaking changes
  use minor records. From `1.0`, follow semantic versioning. Existing runtime/peer
  minimum and removal notice rules still apply. Record intent with
  `bun run changeset`; `release:status` previews it. Repository-only work uses
  empty records. The migration uses an empty repository-only record with no
  version bump; the next real changeset starts an automated Release PR.
- Normal CI checks manifest/lock alignment. Release verification runs baseline
  and the full supported matrix, including intermediate TypeScript and stable
  dependency checks even when called from a push. Node 26 and canary probes
  remain informational. Post-publication checks compare registry tags,
  integrity/archives, and fresh Node/npm and Bun consumers for all six packages.
- The automation handles stable versions under latest. Future prerelease series
  require reviewing the channel/workflow policy first. Historical RC0 and stable
  releases remain intact; never restore consumed initial prerelease records or
  repeat the 0.0.0 bootstrap. New GitHub tags/releases use package names such as
  `@toolgrain/mcp@0.1.1`. See `docs/releases.md` for review and recovery.

## Confirmed npm publication setup

Prepared on 2026-10-24; explicitly approved RC0 and stable publications completed
on 2026-10-25. Future stable publication is approved by merging a reviewed
Changesets Release PR under the automation policy above.

- All six libraries are published with public npm access and an explicit npmjs
  registry. Root, examples, and repo-tools remain private. The manifests and Bun
  workspace versions are `0.1.0`; `publishConfig.tag` is `latest`. All six npm
  `latest` tags resolve to stable `0.1.0`; `next` remains `0.1.0-rc.0`.
- `publish.yml` runs native Changesets automation on main pushes:
  Release PR, full verification, separate pack and OIDC publication jobs, then
  registry/fresh-consumer checks. Stable versions require manifest tag `latest`.
  The existing main-only `npm` environment and six trust bindings are retained.
  The workflow creates native package tags and package-scoped GitHub releases.
- RC0 used npm 11.21.1 with an interactive `keshav.katwe` organization-owner login,
  outside the checkout, lifecycle scripts disabled, and the reviewed Bun
  archives. Login renewal and publish-time browser verification were exercised.
  Do not assume a past login is still valid or republish an existing version.
- All six trusted-publisher bindings were configured for `keshavkatwe/toolgrain`,
  `publish.yml`, environment `npm`, with direct publish permission. npm also
  grants its baseline staging permission; standalone dist-tag permission was
  not enabled. Each binding completed its first successful OIDC publish for
  stable `0.1.0` on 2026-10-25, satisfying initial validation and binding the
  repository identity. Registry publisher IDs match the configured bindings.
  New or replacement trust configurations must complete a first successful
  publish within two days. No npm token secret is configured. A change to the
  workflow publication path requires explicit agreement.
- The source repository is currently private. Provenance was disabled for RC0
  and stable publication; the workflow enables it only for real publishes
  from a public source repository. The GitHub `npm` environment permits only
  main and has no secrets or required reviewers configured. The branch rule is
  not a reviewer approval gate.
- npm assigned `latest` to the first RC0 publication despite explicit
  `--tag next`, and rejected removing it with HTTP 400 after browser verification.
  At that point both tags resolved to `0.1.0-rc.0`. Stable publication has since
  moved `latest` to `0.1.0` for all six packages; `next` retains RC0.
  The [registry specification](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md)
  requires a `latest` tag; the same first-publication behavior is recorded in
  [npm/cli#8490](https://github.com/npm/cli/issues/8490). This is a registry
  limitation in the initial RC publication. Do not publish a placeholder
  version or unpublish RC0 to work around it. Verify actual tags after
  every publication; an explicit `--tag` alone does not prove tag isolation.

## Changesets automation merged — 2026-10-25

- [PR #34](https://github.com/keshavkatwe/toolgrain/pull/34) was reviewed at
  `b6b0fcbee4f335ce63bd41b1169bc6863d404193` with no remaining blockers.
  All 10 executed PR CI jobs passed; three full-release/scheduled jobs were
  intentionally skipped. After the user's merge request, it squash-merged as
  `b7b4b8650a5bf1b9cd3f8687763942b25ac31f67`.
- The [first automatic main workflow](https://github.com/keshavkatwe/toolgrain/actions/runs/40193425606)
  passed its setup, stable-configuration check, and native select-mode job on
  that exact commit. The empty repository-only changeset selected no release;
  versioning, full release verification, packing, publication, and post-publish
  checks were correctly skipped. This migration published no packages or
  GitHub releases; all six manifest versions remain `0.1.0`.
- Pre-merge validation included 28 tooling tests, six native Changesets archive
  dry runs at synthetic `0.1.1` in a disposable checkout, byte/integrity checks
  of all six published `0.1.0` archives, and fresh Node 24.20.0/Bun 1.4.4
  consumers with minimum/current declarations and 10 runtime cases each.
  Local ignored review evidence is in `reports/pr34-review.json`.
- The next real user-facing change should carry a new changeset and exercise
  the bot Release PR, full hosted checks, native OIDC publication, package
  tags/GitHub releases, and registry/fresh-consumer checks. The no-op run does
  not verify those paths end to end. Do not invent a release or republish
  `0.1.0` to test them. Its scope, version, and date remain undecided.

## Published 0.1.0-rc.0 — 2026-10-25

- PR #29 prepared the stable baseline (`e819f87`). Its informational canary
  exposed an inference failure fixed by PR #30 (`60c5ce6`). RC release
  [PR #31](https://github.com/keshavkatwe/toolgrain/pull/31) merged after green CI
  as `3d563791052237d205c252a3a1fefef126a45940`.
- [Release verification](https://github.com/keshavkatwe/toolgrain/actions/runs/40128994353)
  passed all 20 executed jobs on that exact commit, including the full supported
  runtime/platform/dependency matrix and the informational Node 26/canary probes.
- All six libraries (`protocol`, `mcp`, `http`, `node`, `jwt`, `clerk`) were
  published publicly as `0.1.0-rc.0`. Downloaded registry archives matched the
  reviewed archives byte for byte and matched their integrity/shasum metadata.
  Fresh npm `@next` consumers passed six package imports, strict TypeScript
  5.5.4/7.0.2 checks, and all 10 runtime cases on both Node 24.20.0 and Bun 1.4.4.
  Local ignored evidence is in `reports/rc0-registry-verification.json` and
  `reports/rc0-release-verification.json`; it is not a committed artifact.
- After separate explicit approval, GitHub prerelease
  [v0.1.0-rc.0](https://github.com/keshavkatwe/toolgrain/releases/tag/v0.1.0-rc.0)
  and its tag were created at that same commit. The published notes include npm
  and Bun installation instructions, verification, known limitations, and the
  npm tag limitation. `prerelease` is true; GitHub's Latest designation is false.
- Changesets 3.0.3 selected RC0 from an unpublished `0.0.0` planning baseline and
  an initial minor record. No `0.0.0` package was published; do not repeat the
  bootstrap. The RC0 tag recorded mode `pre`, tag `rc` and the initial record
  under `.changeset/pre/`. Stable preparation has since exited prerelease mode
  and consumed those files. A release test
  covers RC0, RC1, stable `0.1.0`, and packed internal versions.
- RC0 approvals covered that candidate. The separately authorized stable
  publication and GitHub release are recorded below; future commits,
  publications, releases, and deployment still need their own authorization.

## Accepted RC0 and stable preparation history — 2026-10-25

- At the user's request, committed the RC publication/status updates in
  `ROADMAP.md` and `AGENTS.md` as `34bffc423b7eee11dd35bce19e38d05344cb7a14`
  on `codex/update-rc0-release-status`. PR #32 included that status commit and
  stable preparation; both are now merged into main.
- The user selected the documented client flows for acceptance. The published
  npm RC0 review completed with 160/172 passing checks; 12 matched the existing
  Codex timeout and Claude rich-result limitations, with passing direct
  cancellation controls and documented workarounds. No new Toolgrain blocker
  was found. The user explicitly accepted those limitations and authorized
  stable preparation, leaving changes uncommitted. See
  [the acceptance record](docs/rc0-acceptance-2026-10-25.md).
- Stable changes were prepared on `codex/release-0.1.0-stable`, based on the
  documentation commit above and RC0 release commit `3d56379`. Changesets ran
  `pre exit` and `release:version`, selected `0.1.0` for all six libraries,
  synchronized Bun workspace metadata, and consumed the prerelease state and
  initial record. All six `publishConfig.tag` values are `latest`; stable
  changelog and installation notes were prepared. Library implementations and
  external dependency pins match RC0. Do not rerun the RC bootstrap.
- Local stable checks passed: frozen install/alignment, 39 baseline
  coverage/example/type tasks, 24 repository-tooling tests, zero audit advisories,
  all six export/declaration checks and fresh Node/npm consumers, minimum Bun
  1.4.4/minimum Zod 4.6.6 consumers, sizes/contents, Biome, and six npm dry runs
  with explicit `--tag latest`. Packed implementation, maps, sources, and license
  bytes match RC0; only package manifests and READMEs differ. Ignored evidence
  is in `reports/stable-prep-*`; hosted stable verification subsequently passed
  as recorded below.
- On 2026-10-25 the user separately authorized committing these stable changes
  and opening a PR against main. Review, merge, hosted verification, publishing
  authentication, stable publication, and tag/GitHub release subsequently
  completed with the agreed approvals. Deployment remains separate. The stable
  commit approval does not authorize future commits.

## Published stable 0.1.0 — 2026-10-25

All first-release gates are complete. The user separately authorized the stable
commit/PR, merge and verification, trusted-publisher setup, real workflow npm
publication, and stable tag/GitHub release. These completed actions do not
authorize future commits, publications, releases, feature work, or deployment.

- [PR #32](https://github.com/keshavkatwe/toolgrain/pull/32) passed review and CI
  at `d2b2cf4`, then merged as
  `526ea39af39413d1ea2693b3961c127343b982e4`. The merged tree matches the reviewed
  tree exactly. All six manifests and Bun workspace versions are `0.1.0`.
- [Release verification](https://github.com/keshavkatwe/toolgrain/actions/runs/40168972464)
  passed all 20 executed jobs on that exact main commit. Supported Linux/macOS/
  Windows Node/Bun consumers, intermediate TypeScript versions, and stable
  dependency checks passed. Node 26 and prerelease probes remain informational.
- The approved [publication workflow](https://github.com/keshavkatwe/toolgrain/actions/runs/40169659323)
  used that same commit with `version=0.1.0`, `dist_tag=latest`, `dry_run=false`,
  and confirmation `publish 0.1.0`. It reran full verification and published all
  six libraries in dependency order with npm 11.21.1 and GitHub Actions OIDC.
  All 22 executed jobs passed; the PR-report job was intentionally skipped.
- All six registry versions, integrity/shasum metadata, and downloaded archives
  were verified. Archives match the reviewed bytes exactly. npm records GitHub
  Actions as publisher and the matching configured OIDC ID for each package.
  `latest` resolves to `0.1.0`; `next` remains `0.1.0-rc.0`. Do not republish an
  existing version or move `next` without a separate decision.
- Fresh public-registry installs through `latest` passed all six imports, strict
  TypeScript 5.5.4/7.0.2 declarations, and all 10 runtime cases each on Node
  24.20.0 and Bun 1.4.4. npm/Node used Zod 4.6.7; Bun used minimum Zod 4.6.6.
  Cases cover both protocol revisions, stdio, HTTP, auth, context, and cancellation.
  Local ignored evidence is in `reports/stable-registry-verification.json` and
  `reports/stable-publication-workflow.json`; it is not a committed artifact.
- After separate approval, tag and [GitHub release v0.1.0](https://github.com/keshavkatwe/toolgrain/releases/tag/v0.1.0)
  were published at `526ea39`. The release is not a draft or prerelease and is
  marked Latest. Notes include installation instructions, RC0 migration,
  verification, and known limitations. RC0's tag/prerelease remain at `3d56379`.
- The release preserves the accepted RC0 scope and client limitations. The tested
  Codex direct-call timeout does not promptly abort server work; the tested
  Claude Code client hides supplemental text beside structured content. Passing
  controls/workarounds and unverified client flows remain documented in
  `docs/rc0-acceptance-2026-10-25.md`. Publication does not expand compatibility
  claims or waive a future supported regression.

## 0.1.0 stable baseline preparation history

Started at the user's request on 2026-10-24 on `codex/release-0.1.0`, based on
main `31aa4e9c06da9eab2f83a97d20218b61cb6c8c7c`. This branch includes the
roadmap and npm publication setup from this chat.

- Changesets consumed the initial baseline, brand-kit, and npm-setup empty
  records. At that preparation point, all six versions and Bun workspace
  metadata were `0.1.0`, with a prepared changelog dated 2026-10-24. RC0
  preparation subsequently changed them to `0.1.0-rc.0`; that candidate is now
  published as recorded above. This section preserves the baseline history.
- Review found parallel Vitest 5 processes clearing the same workspace-root
  module cache. Every Vitest workspace now sets its own
  `fsModuleCachePath: "node_modules/.vitest-cache"`. Parallel coverage, examples,
  and type checks pass with the existing coverage floors.
- The reviewed lockfile updates `body-parser` 2.3.0 to 2.4.0 and `fast-uri`
  3.1.8 to 3.1.9 for upstream security fixes, alongside the approved Zod minimum
  update below. Other direct dependency pins, runtime implementation, and
  vendored schemas remain unchanged.
- Local Node 24.20.0 checks pass for types, coverage, examples, compiled exports,
  minimum/current declarations, isolated installed consumers, package size and
  contents, formatting, workflow lint, and all 23 repository-tooling tests.
  Fresh npm consumers pass all six isolated entry points and all ten full
  stdio/HTTP/auth/context/cancellation cases at both Zod 4.6.6 and 4.6.7. All six
  final archives pass npm 11.21.1 dry runs. Ignored JSON evidence is in `reports/`.
- On 2026-10-24 the user explicitly approved raising the initial Zod peer and
  test floor from 4.0.0 to 4.6.6 for `GHSA-mrhx-c7xc-m3w5`. MCP's peer range,
  `zod-minimum`, the support policy, CI probes, and consumer fixtures now use
  4.6.6; the development pin stays 4.6.7. The stable target remains `0.1.0`,
  preceded by published RC0; strict TypeScript 5.5.4 remains the minimum. The
  dependency audit passes with zero advisories; no audit gate is waived.
- On 2026-10-24 the user explicitly authorized committing these prepared changes
  and opening the baseline `0.1.0` release PR. That approval covered the
  requested commit/PR; later RC0 merge, publication, and tag/GitHub release
  received separate approvals and completed as recorded above.

## Confirmed protocol package decisions

- `@toolgrain/protocol` is published as stable `0.1.0`, owning the unchanged upstream schema, protocol constants, provenance, and license.
- Import wire definitions and `PROTOCOL_VERSION` directly from protocol. MCP does not re-export them. Keep runtime validators and method handling in MCP.
- Protocol has no runtime dependencies and uses the same compiled dist exports, build, watch, test, and declaration checks as other packages.
- Vendored source is excluded from rewriting and verified by checksum. Protocol builds retain upstream license/provenance/schema files in dist.
- Each revision folder also vendors the upstream `schema.json` from the same pinned commit, recorded under `jsonSchema` in provenance and verified by checksum. It is a test-only conformance fixture and is not copied to dist.
- Modern wire exports remain at the package root; legacy wire types use `@toolgrain/protocol/2025-06-18`. Root exports `LEGACY_PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`, `SupportedProtocolVersion`, and shared `ProtocolResponse` envelopes. Both schemas are pinned to the same upstream commit, with separate integrity/provenance/license artifacts in sibling `src/vendor/2026-07-28/` and `src/vendor/2025-06-18/` folders.

## Confirmed MCP package decisions

- `@toolgrain/mcp` is implemented in `packages/mcp` and published on npm as
  stable `0.1.0`, matching its workspace version.
- The `@toolgrain/protocol` package owns the full official `2026-07-28` schema unchanged from commit `271ecc9accafdd9b83a3c869fa67c22953b2af80`, with checksum, provenance, and upstream license. Do not format or modify the vendored source. Updates require explicit review.
- `createServer({ name, version, tools, instructions?, onError? })` supports discovery, tool listing/calling, and `listen(transport)` / terminal, idempotent `close()`.
- Response server identity (`name`, `version`) is copied per response in modern result metadata and legacy initialization, so callers cannot mutate other responses or the server's internal identity.
- Modern requests carry version and client capabilities individually. Legacy stdio uses connection-scoped `initialize` / `notifications/initialized` negotiation and supports `ping`; modern requests remain independent and can interleave. Legacy initialization negotiates `2025-06-18` and never claims modern semantics through `initialize`.
- Input schemas convert with Zod's input-mode JSON Schema 2020-12 conversion and require an object root. Output schemas use output-mode conversion. Fail unrepresentable schemas or invalid metadata at construction. Legacy listings retain supported metadata, omit icons, and advertise only object-root output schemas.
- Strings become text without an output schema; declared outputs include parsed structured content plus serialized text. Other modern JSON values become structured content plus text. Legacy structured content contains only objects; other JSON values are text only. Reject unsupported output values as tool errors.
- Input/output validation and handler failures are tool results with `isError`; unknown tools and invalid protocol messages use protocol errors.
- Modern discovery/list results use `ttlMs: 0`, `cacheScope: "private"`; discovery advertises both supported revisions. Legacy result envelopes omit modern result/cache/server-info metadata. Tool lists are a single page; nonempty cursors are rejected.
- Each MCP tool adapter reuses one internal registry. Cancellation suppresses pending responses and aborts the handler context signal; validation continues once registry execution starts, but a request cancelled during validation never starts its handler. Handlers stop early only if they observe the signal.
- `ToolAdapter` is an explicit internal interface alongside `createToolAdapter()` in `tools/adapter.ts`. Dispatchers and handlers depend on that contract; it is not exported from the public package entry point.
- `protocol/icon.ts` in MCP owns the shared icon validator used by modern client metadata, tool metadata, and resource links. It preserves loose-object validation; legacy icon omission stays in the legacy adapters.
- Keep MCP responsibilities separate: server composition, method dispatch/handlers, protocol validation/envelopes, connection lifecycle, cancellation tracking, schema conversion, execution adaptation, and result conversion.
- Keep revision-specific validation, dispatch, response shaping, and legacy negotiation in separate `modern/` and `legacy/` modules. Share tool execution, JSON normalization, schema conversion, envelope decoding, and transport lifecycle; era selection stays in thin composition modules. Modern modules must not depend on legacy modules. This separation preserves the public API and wire behavior while keeping legacy support removable.
- A runtime-independent transport contract separates message handling from framing. Tests use an in-memory adapter. Stdio is implemented separately in `@toolgrain/node`.
- Resources, prompts, multi-round-trip input-required results, subscriptions, extensions, future publications, and deployment remain separate steps. RC0 and stable `0.1.0` publication are complete.

## Confirmed Node stdio decisions

- `@toolgrain/node` exports `stdio({ input?, output?, maxMessageBytes? })`, defaulting to process stdin/stdout and a 1 MiB incoming-message limit.
- Keep byte framing, writable backpressure, and transport lifecycle in separate modules. The adapter contains no MCP method handling.
- Newline-delimited UTF-8 JSON; malformed JSON/UTF-8 reports parse errors and permits later messages. Oversized frames terminate the transport.
- Close detaches listeners and pauses input without ending/destroying supplied streams or calling process.exit. EOF is the normal shutdown signal.
- `apps/stdio-example` demonstrates a full server, with subprocess tests using compiled packages over actual stdin/stdout. Inspector 2.11.0 was verified in modern protocol mode: discovery, tool listing, and greet execution over stdio pass.

## Confirmed HTTP decisions

- `@toolgrain/http` owns shared Streamable HTTP behavior and `createHttpHandler(server, options?)`, accepting Web Request and returning Promise<Response>.
- `@toolgrain/node` retains stdio and adds `createNodeHttpHandler(server, options?)`; combined handlers own MCP/metadata routing and host validation; applications own framework listeners, TLS, trusted proxy normalization, and CORS. Mount at the root before body parsing. Node also exports `http({ port?, hostname?, path?, allowedHosts?, allowedOrigins?, maxMessageBytes? })` for `server.listen(http(...))`; it owns listener startup/cleanup, defaults to loopback:3000 and /mcp, restricts local hosts to the actual bound port, and exposes a copied `address()`. It installs no global signal handlers.
- Keep the HTTP factories as composition only: split options, endpoint checks, body decoding, request/header validation, parameter-header schema extraction, execution, and response serialization. Node separates request conversion, abort lifecycle, and response writing/backpressure. Share protocol behavior through HTTP rather than duplicating it in Node; do not add a generic utility package without concrete reusable responsibilities.
- HTTP `modern/` and `legacy/` modules own each era's header, notification, status, and error-ID policies. Share endpoint/body/envelope handling, routing and parameter-header comparison, execution, and JSON serialization; choose one of the two internal adapters per request without a plugin framework.
- Both factories accept `path` (default /mcp), `allowedHosts` (default loopback on any port for externally owned listeners), `allowedOrigins`, and `maxMessageBytes` (default 1 MiB). The combined Web handler exposes matches(pathname) for framework composition; Node delegates unrelated paths when a middleware next callback is supplied, before reading their bodies. Matched MCP errors never fall through; standalone unmatched paths retain 404. Host checks precede owned-route auth and body reads, including metadata; both URL and supplied Host authorities must be allowed; the validated Host header preserves the actual resource authority when a framework normalizes URL hosts. Explicit authorities normalize case/default ports; wildcards/schemes/paths are rejected and empty lists deny all. Absent Origin is allowed; a present Origin must match the explicit allowlist, empty by default.
- Support `2026-07-28` and `2025-06-18` with independent POSTs and JSON responses. GET/DELETE return 405. No session IDs or global per-client negotiation state. Persistent sessions, resumability, and SSE/progress/subscriptions remain separate work. Authorization is described below.
- Validate modern protocol/method/name headers against body metadata and declared parameter-header annotations, including Base64 decoding. Legacy initialization may omit the version header; subsequent legacy POSTs carry `2025-06-18`. Optional legacy routing/parameter headers are validated when present. Invalid annotations fail HTTP-handler construction. Valid legacy initialized/cancelled notifications return 202 empty; cancellation is advisory no-op because independent requests have no session/client identity. Modern HTTP notifications remain unsupported.
- MCP exposes `handle(message, { signal?, protocolVersion? })` for independent requests and `getToolDefinitions()` for copied metadata. HTTP passes the validated revision per invocation; shared dispatch/error conversion serves stdio and HTTP. HTTP request IDs are isolated per invocation. Legacy JSON-RPC errors use HTTP 200; modern errors retain modern status rules.
- Cancellation and disconnects suppress delivery and abort the handler context signal; handlers stop early only if they observe it. Closing the server is terminal across HTTP and stdio; closing the attached transport also closes independent processing.
- Examples are separate workspaces: `http-example` (plain Node), `express-example`, `hono-example`, `elysia-example`, and `nextjs-example`. Each owns its dependencies, native dev/build/start commands, and real-process HTTP smoke test. They do not import sibling application code. Next uses the Next CLI, Elysia uses Bun, and Express/Hono use their normal Node workflows. NestJS is not separately verified.

## Repository state and next step

Protocol, MCP, Node stdio, and Streamable HTTP support are implemented. The unified tool authoring API replaces the former core package.
HTTP support and independent framework examples were merged in PR #6
(`e8e2895`) on 2026-10-16 after review and passing CI. Keep Bun 1.3.14,
pinned Turbo, root-level Biome, and shared strict TypeScript defaults.
All six libraries are published on npm as stable `0.1.0` under `latest`, with
stable GitHub release `v0.1.0` marked Latest at `526ea39`. Every first-release
gate is complete. RC0 remains under `next` and its separate GitHub prerelease at
`3d56379`. The documented RC scope and known limitations remain accepted.

Native Changesets automation is merged in PR #34 at `b7b4b86` and active on
main. Its first automatic run passed with no versioning or publication, as
expected for the repository-only migration. The first real automated Release
PR and publication cycle remain to be verified when a user-facing change is
ready; use a new changeset and the reviewed Release PR merge gate. No new
release is selected or authorized just to exercise automation.

Recommended next work is to review
[PR #28 — Build Toolgrain documentation site and Monolith landing page](https://github.com/keshavkatwe/toolgrain/pull/28),
which remains open. Review/merge and GitHub Pages deployment are separate
steps and require their own authorization.

Also try published `0.1.0` in one real client/application,
collect consumer feedback, and prioritize reproduced defects or targeted checks
for the remaining client gaps. This is a recommendation, not an agreed next
implementation step or an unfinished release gate. The application/client,
next release scope, version, and date have not been selected. Use new Changesets
records for subsequent changes: patch for compatible fixes, minor for features
or breaking changes during `0.x`.

Per-tool scope policies, context
lifecycle, resources, prompts, elicitation, and expanded HTTP/session features
remain proposals. `ROADMAP.md` is the concise status list. Agree on the next
scope with the user before starting it; this status update authorizes no
feature work, future commit, publication, release, or deployment.

Dual-era compatibility verification on 2026-10-16 passes the existing tools flow
over stdio and plain Node HTTP with Inspector 2.11.0 CLI and Codex CLI/app-server
0.163.0-alpha.10.2, using Node 24.20.0. Codex works with no modern feature flag or
stdio marker by negotiating `2025-06-18`; explicit modern and mixed-client cases
also pass. Inspector checks both eras and automatic discovery. See
`docs/compatibility.md` and the manual `bun run verify:inspector` check (Node).
That interoperability review did not change user configuration. It alone
conferred no commit/publication authorization; the subsequent RC0 and stable
approvals and completed publications are recorded above. Proposed roadmap features remain
unapproved, without timelines or implementation commitments.

Before changing Turborepo configuration or commands, resolve the installed `turbo` package from the relevant workspace and read its bundled `docs/README.md` and relevant documentation.

HTTP implementation and framework example review is complete. The merged scope
is independent POST requests with JSON responses, with plain Node, Express,
Hono, Elysia, and Next.js examples. Fastify support is deferred. Agree on the
next feature with the user before implementing it; sessions, SSE, and resumability remain separate work. HTTP authorization is implemented as described above. No commits, publication,
or deployment are authorized by implementation alone.

## Development loop

- Root dev is `turbo run dev --concurrency=16` without a filter: run every package/app dev task. The concurrency limit accommodates all persistent watchers and native example servers.
- Library and stdio dev tasks watch src with tsc and write JavaScript/declarations to dist. Framework/HTTP examples use native development commands after dependency builds; each HTTP dev server has a distinct port. Next build output is `.next`, not `dist`.
- All public package exports point to dist. Do not add a development/source export condition.
- Stdio Inspector is a separate example script, launching the compiled server with Bun in modern protocol mode. Reconnect after successful rebuilds to use updated compiled modules.
- Each HTTP example has an `inspect` script connecting to its running development endpoint through the shared `toolgrain-repo inspect-http` launcher. The HTTP launcher uses Bunx outside the workspace, pins Inspector to 2.11.0 in modern HTTP mode, and accepts an optional URL argument to override the endpoint. Start the application separately.
- The example has no hot-reload global server state. Keep build output separate from MCP stdout.

## Package verification

Root `bun run test:package` uses Turbo to run every workspace package verification script after its own build. CI invokes this single command; do not add per-package verification steps.

The root command runs `turbo run test:package test:clean-install`, preserving
Turbo argument forwarding. The uncached root `//#test:clean-install` task waits
for all six libraries' `test:package` tasks, then runs the check under Node.
Package filters apply normally, including excluding the root task when it is not
selected; dry runs do not perform installations. `bun run test:clean-install`
also runs the install check directly after a build.

The check Bun-packs all six libraries and serves their unchanged archives and
packed manifests from a temporary loopback registry for the `@toolgrain` scope.
Each library gets a fresh npm consumer with only that library as a direct
Toolgrain dependency. npm resolves its declared dependency graph and version
constraints normally; no overrides or workspace links supply missing dependencies.
Each consumer imports the installed library and checks its existing declaration
fixture with strict mode and `skipLibCheck: false`. A separate full consumer runs
both protocol revisions over stdio, Web HTTP, Node HTTP, and the managed Node
listener, including context providers, cancellation/disconnects and offline JWT/Clerk
verification. Bun compatibility lanes use `--runtime=bun --package-manager=bun`
to install and execute under Bun itself.
Zod and Node types default to development versions. Every installed library
checks minimum and development TypeScript; optional CLI overrides support weekly
compiler/Zod probes. npm includes the consumer's development tools even with `NODE_ENV=production`. Fixtures live in
`packages/repo-tools/fixtures/clean-install/`; compiled implementations and
repository TypeScript configuration are not copied into consumers. The check
requires npm, tar, external registry access, and loopback access. All consumers,
the npm cache, and the local registry are disposable. Results are written to
`reports/clean-install.json` in the existing CI artifact. Nothing is published
and workspace installs are unchanged.

Each library's verification also runs `toolgrain-repo exports`: `publint --strict`,
then `@arethetypeswrong/cli` with the `esm-only` profile against a Bun-packed
archive (npm pack rejects the Bun `devEngines`). CommonJS and node10 resolution
are intentionally unsupported.

## Repository tooling

- `packages/repo-tools` (`@toolgrain/repo-tools`, private) owns repository
  verification, reporting, and inspection. Its `toolgrain-repo` command provides
  `size`, `exports`, `mcp-compat`, `clean-install`, `support-matrix`, `audit`, `ci-report`, `release`, `inspect-http`, and `verify-inspector`;
  `@toolgrain/repo-tools/http-example` is the shared example smoke test.
- Libraries and HTTP examples declare it as a development dependency. The root
  does not, because a root dependency on an internal package invalidates every
  cached task; root scripts and CI invoke `packages/repo-tools/src/cli.mjs` by path.
- Commands load on demand. `ci-report` runs under Node without installed
  dependencies, so the summary still renders after a failed install;
  `verify-inspector` runs under Node because it verifies the Node runtime.
- Cached `test`, `test:examples`, and `test:package` tasks list
  `$TURBO_ROOT$/packages/repo-tools/src/**` as inputs, so tooling changes rerun them.
- `bun run test:ci` runs the tooling's Bun tests.
- Package-local helpers (`packages/protocol/scripts/copy-vendor.ts` and the stdio
  example's Inspector launcher) stay with their packages.

## Confirmed MCP test tooling decisions

- No additional runtime dependencies. JSON-RPC, write-queue, and JSON-value
  libraries were reviewed and rejected; the hand-written code encodes MCP rules.
- Dev-only tools, pinned exactly: `fast-check` and `ajv` in `packages/mcp`;
  `publint` and `@arethetypeswrong/cli` in `packages/repo-tools`.
- `test/properties.test.ts` covers JSON value acceptance/rejection, result text
  conversion, and envelope decoding with fast-check. Zod record parsing drops own
  `__proto__` keys without changing prototypes; a dedicated test records this.
- `test/conformance.test.ts` validates discovery, listing, call, initialization,
  ping, and error responses against both vendored upstream JSON Schemas with Ajv.
  Legacy errors with unknown IDs use JSON-RPC `id: null`, which the 2025-06-18
  schema cannot express; only their error objects are schema-checked.
- `test/wire-types.test.ts` checks during `check-types` that hand-written Zod wire
  schemas match vendored protocol types, including nested field paths.
- MCP's `test:package` runs `toolgrain-repo mcp-compat` before export checks. It
  reuses `smoke/consumer.mts` with TypeScript 5.5.4 and the development compiler
  against Zod 4.6.6 and the development version, checking declarations with
  `skipLibCheck: false` and no ambient workspace types. The existing runtime
  fixture runs under Node with `--enable-source-maps` for each Zod version and
  checks a stack location in MCP's TypeScript source. Compiled MCP/protocol packages,
  MCP sources, and the selected Zod version are copied into temporary directories to avoid
  workspace resolution fallback. Exact minimum-version aliases live in
  repo-tools as development tooling; verification performs no installations.

## Coverage verification

Root `bun run test:coverage` uses Turbo with each workspace's own build as a
prerequisite and caches `coverage/**` for measured packages. CI runs this instead
of plain tests. Vitest V8 includes all library source files and enforces each of
statements, branches, functions, and lines: 95% per package for MCP, Node, HTTP, JWT, and Clerk.
Protocol integrity runs without coverage instrumentation. Example tests run separately through
root `bun run test:examples`, without coverage instrumentation or coverage floors. CI runs
`test:coverage` and `test:examples` together. CI retains coverage reports for 14 days.

Test results use Vitest's default GitHub Actions reporter: failure annotations
and a job-summary section per workspace, named by each config's `test.name`.
Turbo passes `GITHUB_ACTIONS`, `GITHUB_REPOSITORY`, `GITHUB_SHA`,
`GITHUB_STEP_SUMMARY`, and `GITHUB_WORKSPACE` through without hashing them. A
cache hit replays annotations from logs but does not rewrite the job summary.
CI publishes coverage, sizes, and advisories in a combined Actions summary and a
same-repository PR comment, updated in place on each push. The comment job has
no checkout and does not execute repository code.

## Package size and dependency auditing

- `bun run test:size` builds and packs the six library packages without lifecycle
  scripts or publication. It enforces packed/unpacked byte budgets from
  `package-size.config.json` (found by walking up from the package), every compiled
  module and declaration in `dist`, explicit required protocol artifacts, and
  package-file boundaries. Declared export targets are checked by publint and attw.
- MCP's size policy enables `sourceMaps`: both maps for every compiled module
  and its TypeScript sources must be packed. Verification checks map JSON,
  relative source targets, matching compiled files, and mapping comments in the
  actual archive. Only existing `src/**/*.ts` files are allowed under this policy;
  other packages keep their source-file restrictions. After adding package metadata
  and READMEs, MCP's budgets are 85 KiB packed and 355 KiB unpacked, retaining
  approximately 20% headroom before license additions. Every library requires its
  package-root README and LICENSE; protocol and Clerk additionally require their
  package-root NOTICE files.
- Library builds remove `dist` before compiling. Turbo cache restores do not
  remove extra files, so the size check also fails on any compiled `dist` module
  without a matching `src/**/*.ts` source; rerun `bun run build --force`. Reports include the complete inventory under each package's
  `reports/size.json`; sizes exclude dependencies and retain required vendor files.
- Size budgets initially allow approximately 20% growth, rounded up to KiB. The metadata/README refresh uses packed/unpacked budgets of 14/48 KiB for HTTP, 11/36 KiB for Node, and 6/15 KiB for JWT. Clerk's 7/19 KiB budgets include its full Svix/Deno third-party notices and retain approximately 20% headroom after remeasurement. Protocol retains its existing budget. The MIT license files and protocol NOTICE fit their existing budgets.
  Intentional growth requires reviewing the relevant budget. Size checks are uncached
  and run after successful installation even if an unrelated application build fails.
- `bun run test:audit` runs `bun audit --json` once for the complete lockfile and
  writes root `reports/audit.json`. Per-workspace attribution was removed in favor
  of this lockfile-wide gate. High/critical advisories and scan errors fail CI;
  low/moderate findings are reported. Scanner failures retain stderr in reports
  and logs. It does not update dependencies.
- Auditing runs outside Turbo caching, so stale audit reports are never restored.
- CI includes sizes and advisory findings in the combined summary/PR comment and
  retains JSON reports in the existing artifact for 14 days. `bun run test:ci`
  verifies the checking and reporting commands, running the renderer under Node.
  Malformed JSON/schema reports fail rendering after the healthy results and
  diagnostics have been written to the combined report and Actions summary.
