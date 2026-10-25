# Roadmap

Status updated: 2026-10-25.

All six libraries are published on npm as stable **`0.1.0`** under **`latest`**.
The [GitHub release `v0.1.0`](https://github.com/keshavkatwe/toolgrain/releases/tag/v0.1.0)
is published and marked Latest at verified commit `526ea39`.
**✅ Done** covers the agreed scope; **🟡 Pending/Partial** means work or
verification remains. Proposed items are unapproved, with no timelines or
implementation commitments. Local commits and deployment still require
authorization. Future stable publication is approved by merging a reviewed
Changesets Release PR.

**npm tags:** all six packages have `latest` pointing to `0.1.0` and `next`
pointing to `0.1.0-rc.0`. Install `@0.1.0` to pin stable or `@latest` to follow
stable releases. The [RC0 prerelease](https://github.com/keshavkatwe/toolgrain/releases/tag/v0.1.0-rc.0)
remains at `3d56379` as the candidate record.

## Before stable `0.1.0`

**✅ Complete — no first-release blockers remain.** The gates from the
[release policy](./docs/releases.md) were completed on 2026-10-25:

1. **✅ Done — RC acceptance for the documented scope.** The published-candidate
   review found no new Toolgrain blocker: 160/172 checks passed; 12 reproduced
   existing Codex/Claude limitations with passing controls/workarounds. The user
   accepted those documented limits on 2026-10-25. See the
   [acceptance record](./docs/rc0-acceptance-2026-10-25.md).
2. **✅ Done — Stable release review and merge.** Changesets promoted all six
   versions to `0.1.0`, consumed prerelease records, and synchronized Bun metadata.
   [PR #32](https://github.com/keshavkatwe/toolgrain/pull/32) passed review and CI,
   then merged as `526ea39` after explicit approval.
3. **✅ Done — Stable commit verification.**
   [Release verification](https://github.com/keshavkatwe/toolgrain/actions/runs/40168972464)
   passed all 20 executed jobs on that exact main commit, including the full
   supported runtime/platform/dependency matrix. Node 26 and canary probes remain
   informational.
4. **✅ Done — Trusted publishers.** All six bindings use
   `keshavkatwe/toolgrain`, `publish.yml`, environment `npm`, and publish
   permission. Successful OIDC publication validated every binding; npm records
   the matching publisher IDs. The GitHub environment is restricted to main.
5. **✅ Done — Stable npm publication and registry checks.** The approved
   [publication workflow](https://github.com/keshavkatwe/toolgrain/actions/runs/40169659323)
   passed all 22 executed jobs and published all six libraries under `latest`.
   Downloaded archives match reviewed bytes and registry integrity. Fresh npm/Node
   and Bun consumers passed all six imports, strict TypeScript 5.5.4/7.0.2 checks,
   and all 10 runtime cases each, including minimum Bun 1.4.4 and Zod 4.6.6.
6. **✅ Done — Stable GitHub release.** Tag and
   [release `v0.1.0`](https://github.com/keshavkatwe/toolgrain/releases/tag/v0.1.0)
   point to `526ea39`. The published stable release is marked Latest and includes
   release notes, npm/Bun installation instructions, and known limitations.

## What's next

**✅ Done — Changesets automation is merged and active.**
[PR #34](https://github.com/keshavkatwe/toolgrain/pull/34) merged as `b7b4b86`
after review and 10 passing CI jobs, with three expected skips. The
[first automatic main run](https://github.com/keshavkatwe/toolgrain/actions/runs/40193425606)
passed selection and correctly skipped versioning and publication for this
repository-only migration. All six versions remain `0.1.0`.

**Recommended next step — 🟡 Review pending:** review
[PR #28 — Build Toolgrain documentation site and Monolith landing page](https://github.com/keshavkatwe/toolgrain/pull/28).
It is still open. Review/merge and GitHub Pages deployment remain separate
steps; this status update authorizes neither.

**🟡 Pending — Real-application feedback.** Try published `0.1.0` in one real
client/application, collect feedback, and prioritize reproduced defects or the
remaining client checks below. The application/client and implementation scope
have not been selected. The documented-flow acceptance and first-release gates
are already complete.

**🟡 Pending — First automated release cycle.** The next real user-facing change
should include a changeset. Verify the bot's Release PR, review and merge it,
then verify the full checks, npm publication, package tags/releases, and fresh
consumers. Those hosted paths were skipped by the successful no-op run and are
not yet verified end to end. No release scope, version, or date is selected;
do not create a release just to exercise automation. Compatible fixes use patch
records; features and breaking changes use minor records during `0.x`.

Proposed protocol/API features still require a design decision. Keep known
client limitations visible and claim compatibility only for verified flows;
publication does not waive future supported regressions.

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
    libraries as a fixed group, with `0.1.0-rc.0` before stable `0.1.0`. The
    historical root changelog records the initial releases. Native package
    changelogs and automation are merged in PR #34; full release verification
    remains a publication gate. The first main run passed without a release;
    the first real automated cycle remains pending as described above. See
    [release guide](./docs/releases.md).
12. **✅ Done — Brand kit.** The approved Monolith logo, wordmark, colors,
    typography, motion direction, and reusable assets are in `brand/`.
13. **🟡 Partial — Client interoperability.** Inspector passes; Codex and Claude
    Code tool flows pass with recorded limitations. Cursor execution and
    cancellation, modern Claude Code coverage, live OAuth login, and GUI flows
    remain unverified. See [tested versions and results](./docs/interoperability-2026-10-22.md).
14. **✅ Done for 0.1.0 — Supported runtime and platform verification.** The
    stable commit passed supported Node/Bun checks across Linux, macOS, and
    Windows, plus minimum/intermediate TypeScript and stable dependency probes.
    Future releases require verification on their own final commits.
15. **🔄 Ongoing — Public API stabilization.** The current API review is complete;
    further API changes still need design review. Versioning and compatibility
    policies are adopted.
16. **✅ Done — npm publication setup, trusted publishers, and automation.**
    Public package access and six validated OIDC publishers are in use. Native
    Changesets automation replaced the manual workflow in merged PR #34.
    All six trusted publishers completed a successful publish through
    `publish.yml`; the GitHub `npm` environment is restricted to main. See
    [publishing process](./docs/releases.md#npm-publication-setup).
17. **✅ Done — Initial npm and GitHub prerelease.** All six `0.1.0-rc.0`
    packages are published and verified on npm; GitHub prerelease
    `v0.1.0-rc.0` points to `3d56379`. RC acceptance is complete; the candidate
    remains available by exact version or `@next`.
18. **✅ Done — Stable npm and GitHub release.** All six `0.1.0` libraries are
    verified under `latest`, and GitHub release `v0.1.0` is published at `526ea39`.
    Every first-release gate above is complete.
19. **🟡 Review pending — Documentation and quickstarts website.** Docusaurus and
    GitHub Pages are selected. Implementation is in open
    [PR #28](https://github.com/keshavkatwe/toolgrain/pull/28), with documentation
    and the Monolith landing page. Review/merge and deployment remain separate
    steps; no deployment is authorized by this status update.
20. **🔄 Ongoing — Protocol and compatibility maintenance.** Pinned schemas,
    provenance, checksums, and integrity checks are implemented. Future protocol
    updates need explicit review and renewed interoperability checks.
21. **💡 Proposed — Per-tool authorization and scope policies.** Add policies
    beyond the implemented endpoint authorization and identity accessors.
22. **💡 Proposed — Context cleanup and lifecycle hooks.** Design resource
    disposal; provider values and application-owned resources currently have no
    automatic cleanup.
23. **💡 Proposed — Resources support.** Design and implement the MCP resources
    feature.
24. **💡 Proposed — Prompts support.** Design and implement the MCP prompts
    feature.
25. **💡 Proposed — Elicitation and multi-round-trip input.** Design additive
    handler-context fields and input-required results.
26. **💡 Proposed — Sessions, SSE streaming, progress, and resumability.** Extend
    the current independent HTTP POST and JSON-response scope.
27. **💡 Proposed — Subscriptions and change notifications.** Extend the current
    static tool registry and listing flow.
28. **💡 Proposed — Performance, concurrency, and resilience testing.** Add load,
    endurance, and performance checks beyond existing concurrency and
    cancellation regression tests.
29. **🚫 Proposed exclusion — Deprecated MCP features.** Keep sampling, logging,
    roots, Dynamic Client Registration, and the deprecated HTTP+SSE transport
    outside scope. See the [deprecated features registry](https://modelcontextprotocol.io/specification/2026-07-28/deprecated).
