# RC0 acceptance — 2026-10-25

The user accepted the documented RC0 scope and known client limitations on
2026-10-25 and authorized preparing stable `0.1.0`, leaving its changes
uncommitted for review. Stable commit/PR authorization was granted separately
later on 2026-10-25. Acceptance alone does not authorize publication,
tag/GitHub release, or deployment.

## Reviewed candidate

All six published npm libraries were `0.1.0-rc.0`, from release commit
`3d563791052237d205c252a3a1fefef126a45940`. Their downloaded archives matched
the reviewed archives byte for byte. The [GitHub prerelease](https://github.com/keshavkatwe/toolgrain/releases/tag/v0.1.0-rc.0)
and [20-job Release verification](https://github.com/keshavkatwe/toolgrain/actions/runs/40128994353)
refer to that same commit. The documentation status commit is `34bffc4`.

The acceptance review used installed npm libraries outside the repository,
Node 24.20.0 on macOS arm64, isolated client configuration, and local deterministic
API fixtures. Codex used its direct app-server tool-call API; Claude used a local
Messages API fixture. No paid inference, live OAuth login, or persistent user
configuration changes were involved. The user selected the documented flows;
this was not acceptance testing in an additional production application.

## Results

| Client/check | Passed | Total | Result |
| --- | ---: | ---: | --- |
| Inspector 2.11.0, modern/legacy/automatic discovery, stdio and HTTP | 30 | 30 | Pass |
| Codex CLI/app-server 0.163.0-alpha.10.2, default/modern/mixed, stdio/HTTP/protected HTTP | 93 | 102 | Nine cases reproduce the documented timeout limitation |
| Claude Code 2.1.191, stdio/HTTP/protected HTTP | 30 | 33 | Three cases reproduce the documented rich-result limitation |
| Claude Code 2.1.191 timeout controls | 3 | 3 | Pass |
| Direct stdio cancellation and HTTP disconnect controls, both protocol revisions | 4 | 4 | Pass |
| **Total** | **160** | **172** | **No new Toolgrain blocker in the agreed flows** |

The 12 non-passing assertions match the issue identities and client versions
from the [2026-10-22 interoperability review](interoperability-2026-10-22.md).
They remain recorded as limitations rather than being counted as passing checks.
GitHub had no open issues at the acceptance review; that alone does not establish
broader user feedback or compatibility.

## Accepted limitations and workarounds

1. **Codex direct-call timeout:** the tested client times out without promptly
   aborting server work. Applications doing expensive work should impose their
   own execution deadlines. Direct stdio cancellation and HTTP disconnect
   controls pass for both protocol revisions; Toolgrain cancellation remains
   cooperative through `ctx.signal`.
2. **Claude rich-result rendering:** supplemental text is hidden when structured
   content is supplied. Both documented workarounds pass on all three transports:
   put essential narrative in structured content, or use text-only content where
   the tool contract permits it.

Cursor execution/cancellation, modern Claude Code coverage, live OAuth login,
and GUI flows remain unverified. HTTP scope remains independent POST requests
with JSON responses. Resources, prompts, elicitation, persistent sessions,
streaming, progress, resumability, and subscriptions remain outside this release.
The user accepted this documented scope; it does not expand compatibility claims
or waive a future supported regression.

Local ignored evidence is under `reports/rc0-acceptance/`, including per-client
JSON, logs, the setup record, and summary. Published-package evidence is in
`reports/rc0-registry-verification.json`. These local reports are not committed
release artifacts; this document records their results and the acceptance decision.

## Next gate

Review the prepared stable versions, consumed prerelease records, matching Bun
workspace metadata, explicit `latest` publication tags, and stable notes. The
final stable commit still requires green PR CI and full hosted Release
verification. Trusted-publisher bindings, stable npm publication, and stable
GitHub release remain pending and require the agreed authorization.
