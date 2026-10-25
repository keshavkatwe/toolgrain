# Roadmap

Status updated: 2026-10-25.

All six libraries are published on npm as **`0.1.0-rc.0`**, and the
[GitHub prerelease](https://github.com/keshavkatwe/toolgrain/releases/tag/v0.1.0-rc.0)
is published at verified commit `3d56379`. Stable **`0.1.0` is prepared for
review and remains unpublished**.
**✅ Done** covers the agreed scope; **🟡 Pending/Partial** means work or
verification remains. Proposed items are unapproved, with no timelines or
implementation commitments. Future commits, publication, and deployment still
require their own authorization.

**✅ RC0 complete:** baseline, canary, and release preparation merged in
[PR #29](https://github.com/keshavkatwe/toolgrain/pull/29),
[PR #30](https://github.com/keshavkatwe/toolgrain/pull/30), and
[PR #31](https://github.com/keshavkatwe/toolgrain/pull/31).
[Release verification](https://github.com/keshavkatwe/toolgrain/actions/runs/40128994353)
passed all 20 executed jobs. All six downloaded npm archives match the reviewed
archives; fresh `@next` consumers passed strict TypeScript 5.5.4/7.0.2 checks and
all 10 runtime cases on both Node 24.20.0 and Bun 1.4.4.

**npm tags:** all six packages have `next` and `latest` pointing to RC0. npm
assigned `latest` on the initial publication despite explicit `--tag next` and
rejected its removal with HTTP 400. Its
[registry specification](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md)
requires a `latest` tag. Use an explicit version or `@next`; the `latest` label
does not establish a stable Toolgrain release. GitHub marks RC0 as a prerelease
with its Latest designation disabled.

## Before stable `0.1.0`

These are the remaining gates from the [release policy](./docs/releases.md).
**Next step: review the stable release PR and its CI before authorizing merge.**

1. **✅ Done — RC acceptance for the documented scope.** The published-candidate
   review found no new Toolgrain blocker: 160/172 checks passed; 12 reproduced
   existing Codex/Claude limitations with passing controls/workarounds. The user
   accepted those documented limits on 2026-10-25. See the
   [acceptance record](./docs/rc0-acceptance-2026-10-25.md). New feedback exposing
   failures of promised behavior still needs resolution and another RC if needed.
2. **🟡 Prepared, review pending — Stable release changes.** On
   `codex/release-0.1.0-stable`, Changesets exited prerelease mode, selected
   `0.1.0` for all six libraries, synchronized Bun metadata, and consumed the
   prerelease records. Manifests select `latest`; stable changelog and
   installation notes are prepared. Local baseline, exports, Node/Bun consumers,
   sizes, audit, and six npm dry runs passed. The user authorized the stable
   commit and PR on 2026-10-25. Review and green PR CI remain pending; merge
   requires separate authorization.
3. **🟡 Pending — Stable commit verification.** After the stable PR merges, run
   Release verification on its exact main commit with expected version `0.1.0`.
   Baseline and the full supported runtime/platform/dependency checks, including
   stable/intermediate probes, must pass. Node 26 and the prerelease canary stay
   informational. RC0's green run verifies RC0, not the future stable commit.
4. **🟡 Pending — Publishing authentication for the planned workflow.** Configure
   the six npm trusted-publisher bindings for `keshavkatwe/toolgrain`,
   `publish.yml`, and environment `npm`; packages now exist. Configure close to
   the approved publication because new trust requires its first successful
   publish within two days. OIDC publication has not been exercised. Any change
   to the planned publication path needs explicit agreement.
5. **🟡 Pending approval — Stable npm publication and registry checks.** Obtain
   explicit stable-publication approval, publish the reviewed `0.1.0` archives
   under `latest`, then verify all six versions, archive integrity, dist-tags,
   and fresh registry consumers. RC0 approval does not authorize stable.
6. **🟡 Pending approval — Stable GitHub release.** Obtain approval for tag
   `v0.1.0` and its GitHub release at the verified stable commit, with stable
   release notes and installation instructions, after npm availability is
   verified. The existing RC0 tag and prerelease remain the candidate record.

The documentation website and proposed features below are outside these release
gates. Client verification gaps remain tracked below: disclose known limitations
and claim compatibility only for verified flows. Any failure of promised
behavior must be resolved or explicitly scoped out before release. There is no
agreed stable release date.

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
    libraries as a fixed group, with `0.1.0-rc.0` before stable `0.1.0`. One
    manually maintained root changelog and a manual release-verification
    workflow are in place. See
    [release guide](./docs/releases.md).
12. **✅ Done — Brand kit.** The approved Monolith logo, wordmark, colors,
    typography, motion direction, and reusable assets are in `brand/`.
13. **🟡 Partial — Client interoperability.** Inspector passes; Codex and Claude
    Code tool flows pass with recorded limitations. Cursor execution and
    cancellation, modern Claude Code coverage, live OAuth login, and GUI flows
    remain unverified. See [tested versions and results](./docs/interoperability-2026-10-22.md).
14. **✅ Done for RC0 — Supported runtime and platform verification.** RC0's
    full release run passed the supported Node/Bun checks across Linux, macOS,
    and Windows, plus minimum/intermediate TypeScript and stable dependency
    probes. Repeat verification for the final stable commit.
15. **🔄 Ongoing — Public API stabilization.** The current API review is complete;
    further API changes still need design review. Versioning and compatibility
    policies are adopted.
16. **✅ Done — First-release npm publication setup.** Public package access,
    Changesets settings, and the manual dry-run/OIDC workflow are prepared and
    checked locally. The GitHub `npm` environment is restricted to main; npm
    login and organization-owner publishing rights are verified. See
    [publishing process](./docs/releases.md#npm-publication-setup).
17. **✅ Done — Initial npm and GitHub prerelease.** All six `0.1.0-rc.0`
    packages are published and verified on npm; GitHub prerelease
    `v0.1.0-rc.0` points to `3d56379`. Both npm tags currently resolve to RC0 as
    explained above. RC acceptance is complete; stable `0.1.0` changes are
    prepared for review and await the remaining gates above.
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
29. **🟡 Pending — npm trusted-publisher bindings.** RC0 created all six
    packages, so bindings can now be configured for the planned workflow
    publication. No OIDC publish has been verified; see stable gate 4.
