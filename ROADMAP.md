# Roadmap

Status updated: 2026-10-25.

All six libraries are configured for public npm access. The first candidate is
`0.1.0-rc.0` under `next`, before stable `0.1.0`; publication is pending.
**✅ Done** covers the agreed scope; **🟡 Partial** means implementation or
verification remains. Proposed items are unapproved, with no timelines or
implementation commitments. Publication and deployment require separate approval.

## First release blockers — `0.1.0-rc.0` → `0.1.0`

These are the required gates from the [release policy](./docs/releases.md).
The stable baseline and canary fix were merged in PRs #29 and #30. The first RC
is now prepared on a separate branch with explicit `next` tag controls.

1. **✅ Done — First-release npm publication setup.** Public package settings and a manual
   dry-run workflow are verified locally; the GitHub `npm` environment permits
   only main. The authenticated npm account `keshav.katwe` is a `toolgrain`
   organization owner with publishing rights. The initial release uses approved
   interactive publication; OIDC bindings follow once packages exist.
2. **🟡 Partial — RC preparation and review.** All six libraries are prepared at
   `0.1.0-rc.0`. Changesets owns the RC counter and stable promotion; manifests
   default to `next`, and workflow guards enforce version/tag matching.
   Committing the RC, opening its release PR, and merging after green CI are
   authorized on 2026-10-25 and remain pending.
3. **🟡 Pending verification — Green release checks.** Run Release verification
   on the prepared main commit with expected version `0.1.0-rc.0`. Baseline and the
   full supported runtime/platform/dependency checks must pass, including the
   stable weekly probes. The workflow exists; passing results for the final
   release commit still need review. Node 26 and prerelease probes remain
   informational.
4. **🟡 Authorized, pending gates — Publish the RC.** The user authorized the
   prerelease on 2026-10-24. Publish the reviewed `0.1.0-rc.0` archives under
   `next` only after the gates above pass. Stable `0.1.0`, Git tags, GitHub
   Releases, and deployment require separate authorization.

The documentation website and proposed features below are outside these release
gates. Client verification gaps remain tracked below: disclose known limitations
and claim compatibility only for verified flows. Any failure of promised
behavior must be resolved or explicitly scoped out before release.

## Full roadmap

1. **✅ Done — Supported protocols and transports.** MCP `2026-07-28` and
   `2025-06-18` tools over stdio and independent HTTP POSTs with JSON responses.
   Legacy initialization can negotiate down to `2025-06-18`.
2. **✅ Done — Typed tool authoring API.** Reusable tool definitions, Zod 4 input
   and output validation, inferred types, ordinary results, and explicit rich
   MCP results live in `@toolgrain/mcp`.
3. **✅ Done — Public API review.** All four findings were fixed in
   [PR #22](https://github.com/keshavkatwe/toolgrain/pull/22): tool variants,
   rich-result types, auth diagnostics, and readonly content/icons.
4. **✅ Done — Handler context and cooperative cancellation.** `ToolContext`,
   `toolContext()`, request metadata, and cancellation signals are implemented
   for the agreed v0 scope.
5. **✅ Done — HTTP authorization and request identity.** JWT and Clerk
   integrations provide eager verification, frozen identities, and
   protected-resource metadata. See [authorization](./docs/authorization.md).
6. **✅ Done — Lazy context providers.** Request-cached inferred accessors,
   dependency/cycle checks, and typed overrides are implemented. See
   [context providers](./docs/context.md).
7. **✅ Done — Packed-package installation tests.** `bun run test:package` checks
   all six libraries through isolated consumers, including both protocol
   revisions over stdio and HTTP.
8. **✅ Done — Package and CI checks.** Coverage floors, compiled exports and
   declarations, minimum TypeScript/Zod consumers, package contents and size
   budgets, and dependency auditing are implemented.
9. **✅ Done — Runtime and dependency policy and CI configuration.** Node
   `^24.20.0`, Bun `>=1.4.4 <2`, strict TypeScript 5.5.4 minimum, and Zod
   `^4.6.6` are selected. Platform and weekly dependency jobs are configured;
   Node 26 remains preview. See [support policy](./docs/support-policy.md).
10. **✅ Done — Package metadata and licensing.** All six libraries have package
    metadata, READMEs, and licenses. Toolgrain-owned code is MIT licensed;
    upstream protocol and Clerk dependency notices are preserved.
11. **✅ Done — Versioning and release verification.** Changesets manages the six
    libraries as a fixed group, with `0.1.0-rc.0` before stable `0.1.0`. One manually maintained root
    changelog and a manual release-verification workflow are in place. See
    [release guide](./docs/releases.md).
12. **✅ Done — Brand kit.** The approved Monolith logo, wordmark, colors,
    typography, motion direction, and reusable assets are in `brand/`.
13. **🟡 Partial — Client interoperability.** Inspector passes; Codex and Claude
    Code tool flows pass with recorded limitations. Cursor execution and
    cancellation, modern Claude Code coverage, live OAuth login, and GUI flows
    remain unverified. See [tested versions and results](./docs/interoperability-2026-10-22.md).
14. **🟡 Partial — Supported runtime and platform verification.** The CI matrix is
    implemented; each hosted combination needs passing results before it can be
    called verified.
15. **🔄 Ongoing — Public API stabilization.** The current API review is complete;
    further API changes still need design review. Versioning and compatibility
    policies are adopted.
16. **✅ Done — First-release npm publication setup.** Public package access,
    Changesets settings, and the manual dry-run/OIDC workflow are prepared and
    checked locally. The GitHub `npm` environment is restricted to main; npm
    login and organization-owner publishing rights are verified. See
    [publishing process](./docs/releases.md#npm-publication-setup).
17. **🟡 Partial — Initial npm prerelease.** `0.1.0-rc.0` is prepared under
    `next`, with the approved Zod 4.6.6 minimum. Finish the RC release PR and
    supported hosted verification, then perform the authorized publication.
    Stable `0.1.0` follows candidate testing and separate approval.
18. **⏸️ Deferred — Documentation and quickstarts website.** Docusaurus and GitHub
    Pages are selected. README, guides, and framework examples exist; website
    implementation and deployment remain separate work.
19. **🔄 Ongoing — Protocol and compatibility maintenance.** Pinned schemas,
    provenance, checksums, and integrity checks are implemented. Future protocol
    updates need explicit review and renewed interoperability checks.
20. **💡 Proposed — Per-tool authorization and scope policies.** Add policies
    beyond the implemented endpoint authorization and identity accessors.
21. **💡 Proposed — Context cleanup and lifecycle hooks.** Design resource
    disposal; provider values and application-owned resources currently have no
    automatic cleanup.
22. **💡 Proposed — Resources support.** Design and implement the MCP resources
    feature.
23. **💡 Proposed — Prompts support.** Design and implement the MCP prompts
    feature.
24. **💡 Proposed — Elicitation and multi-round-trip input.** Design additive
    handler-context fields and input-required results.
25. **💡 Proposed — Sessions, SSE streaming, progress, and resumability.** Extend
    the current independent HTTP POST and JSON-response scope.
26. **💡 Proposed — Subscriptions and change notifications.** Extend the current
    static tool registry and listing flow.
27. **💡 Proposed — Performance, concurrency, and resilience testing.** Add load,
    endurance, and performance checks beyond existing concurrency and
    cancellation regression tests.
28. **🚫 Proposed exclusion — Deprecated MCP features.** Keep sampling, logging,
    roots, Dynamic Client Registration, and the deprecated HTTP+SSE transport
    outside scope. See the [deprecated features registry](https://modelcontextprotocol.io/specification/2026-07-28/deprecated).
29. **⏸️ Deferred — npm trusted-publisher bindings.** Configure each package's
    OIDC binding for subsequent workflow releases after the first approved
    publication creates the packages. This does not block the initial
    interactive release.
