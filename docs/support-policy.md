# Runtime and dependency support

All six libraries are published as stable **0.1.0**. This policy defines their
runtime and dependency contract. CI configuration alone does not establish that
an unrun platform has passed; releases require a green supported matrix. See the
[published-package verification](./rc0-acceptance-2026-10-25.md) for recorded results.

## Supported versions

| Component | Contract | Verification |
| --- | --- | --- |
| Node.js | 24.x from 24.20.0, for all six libraries | Exact minimum in the full baseline; latest 24.x in packed-consumer jobs |
| Bun runtime | 1.x from 1.4.4, for all six libraries | Minimum on Linux and latest stable 1.x on Linux, macOS, and Windows |
| Repository tools | Bun 1.3.14 and Node 24.20.0 baseline | Frozen lockfile; the Bun development pin is independent of consumer runtime support |
| TypeScript | 5.5.4 minimum, with strict mode | Minimum and development compiler for each installed library; MCP/JWT/Clerk also cross minimum/current Zod |
| Zod | `^4.6.6`, Classic and Mini | Minimum 4.6.6 and development version; weekly current 4.x |
| Modules | ESM, compiled `dist` exports and declarations | Package exports, isolated imports, and declaration consumers; CommonJS/node10 resolution are unsupported |
| Operating systems | Linux, macOS, Windows on the architectures exercised by CI | Real packed consumers, stdio subprocesses, HTTP listeners, disconnect/cancellation and cleanup; reports/logs record runtime/platform/architecture |
| Installation | npm and Bun | Unchanged Bun-packed archives installed through each package manager's resolver |

Node support is declared as `^24.20.0`; Bun as `>=1.4.4 <2`, in every library.
The root manifest describes development requirements. It is not a substitute for
published package metadata. `support-policy.json` records the approved floors
and ranges; packed-install checks reject missing or inconsistent library ranges.
These declarations describe each runtime separately, not a requirement to run
both Node and Bun. Package engines are advisory in npm unless the consumer uses
`engine-strict`; they are not a runtime guard.

The initial Bun 1.3.14 runtime proposal failed the new disconnect test: its
`node:http` server did not emit the response/socket close events needed to abort
an in-flight handler. Bun 1.4.0 also failed the disconnect test; 1.4.4 passed it.
The application runtime floor is therefore 1.4.4, while repository tooling
remains pinned at 1.3.14. Earlier Bun example checks established only their tested subset, not the
complete adapter contract. See [Bun 1.4's Node compatibility changes](https://bun.com/blog/bun-v1.4#nodejs-compatibility).

The initial release uses a Zod floor of 4.6.6 because earlier
versions are affected by [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
Strict TypeScript 5.5.4 remains the compiler minimum.

Node 26 has a non-blocking preview job. Its upstream LTS transition is scheduled
for 2026-10-28. Promotion requires a reviewed policy/manifest/CI change after LTS
and successful verification; the date alone does not promote it. Node 24's
scheduled EOL is 2028-04-30. Node 22 is outside the initial matrix; its scheduled
EOL is 2027-04-30. See the [upstream Node schedule](https://github.com/nodejs/Release/blob/main/schedule.json).

Deno, Workers, browsers, other package managers, and untested OS/architecture
combinations have no support commitment. Runtime-independent modules may be
usable there. Framework examples retain their own pinned framework/runtime
requirements; an example is not a promise to support every framework version.

## Required CI

`.github/workflows/ci.yml` retains the complete Linux/Node 24.20.0 baseline:
formatting/lint, type checks, 95% coverage floors, framework examples, builds,
compiled consumers, minimum Zod checks, package exports, clean installs, sizes,
dependency audit, and repository-tooling tests. It also runs for release tags.

`.github/workflows/support.yml` runs on PRs, main, release tags and manual runs:

- Latest Node 24 on Linux, macOS and Windows with npm consumers.
- Bun 1.4.4 on Linux and latest stable Bun 1.x on all three OSes with Bun consumers.
- Node 26 on Linux as an explicitly non-blocking preview.

Each compatibility job builds libraries through Turbo's package filter and runs
uncached packed-install verification directly. Every library gets its own
consumer with minimum and development compiler checks, strict mode and
`skipLibCheck: false`. The full consumer verifies both protocol eras, Web/Node
HTTP, the managed listener, actual stdin/stdout, contexts, rich results, input
validation, stdio cancellation, HTTP disconnects and cleanup. Auth checks cover
signed RS256/ES256 JWTs, audience rejection, frozen identities, Clerk OAuth JWTs
and Clerk's opaque-token path using synthetic fetch responses. No live keys,
OAuth login, consent flow or provider network calls are involved.

Bun runs the functional consumer suite itself, including its subprocesses.
Node runs its own suite; invoking scripts through Bun alone is not runtime
coverage. The existing Node source-map stack assertion remains required. On
Bun 1.3.14, that assertion reports compiled JS locations; mapped TypeScript
stacks are currently a Node-specific guarantee. This does not waive functional
checks on Bun or alter the package's maps/sources.

Every Monday, and on manual workflow dispatch, additional jobs run:

- The latest patch of every TypeScript minor between the approved minimum and
  development compiler minor, against latest Zod 4. Registry lookup errors fail the
  plan instead of silently reducing coverage.
- Stable upstream dependency drift within jose 6, Clerk backend 3 and Clerk
  shared 4, latest stable TypeScript, and latest Zod 4. Only disposable CI
  manifests/lockfiles change. This job must pass before a release.
- A non-blocking Bun canary/TypeScript-next probe. Prereleases are not supported
  merely because this probe passes.

The stable matrix and baseline must be green before merge/release. A confirmed
regression from weekly checks in a supported version also blocks release until
resolved; prerelease/Node-26 preview failures are informational. No publication
is performed by these workflows. New matrix check names must be selected in
repository branch protection when configuring required checks; workflow files
alone do not change GitHub repository settings.

The manual [Release verification workflow](releases.md#failures-and-recovery) reuses
both workflows at the selected source commit, including weekly stable dependency
and intermediate TypeScript checks. It does not produce candidate archives.

Reports are retained as separate job artifacts with runtime/package-manager
identity. Linux/macOS/Windows hosted results are required before claiming those
specific combinations verified. Local runs cannot stand in for another OS.

## Upgrade and deprecation rules

1. Review dependency updates monthly; handle urgent security fixes sooner. Keep
   direct runtime/development dependencies exactly pinned and commit a reviewed
   lockfile. Weekly floating probes never change normal installation policy.
2. Runtime dependencies, especially jose and Clerk, must pass the supported
   runtime and declaration floors, auth regressions, exports and packed installs.
   Development compiler/tool upgrades must also preserve emitted declaration
   compatibility. A transitive requirement increase counts too.
3. Add new runtime/dependency majors explicitly after stable upstream release
   and successful CI/interoperability checks relevant to the change. Do not
   infer support from a broad `>=` range or a successful preview job.
4. Raising a Node, Bun, TypeScript or Zod minimum, dropping a supported major,
   or removing public behavior is a breaking change: use a minor release during
   `0.x` and a major release from `1.0`. Updating the development pin alone is
   not a consumer minimum increase.
5. Announce removals at least 90 days and one published release beforehand,
   whichever is longer, with a migration path and affected package versions.
   A documented security emergency may shorten notice; never hide the change.
   The initial unpublished baseline does not need a deprecation period.
6. Review runtime retirement around upstream EOL. An EOL date does not silently
   change already-published package ranges or authorize indefinite old-branch
   maintenance. State the last supported Toolgrain release when retiring a target.
7. Protocol revisions and vendored schemas require their own explicit review,
   provenance/checksum updates, conformance and interoperability verification.
   Dependency automation must not rewrite them. Renew client checks for protocol,
   transport/auth behavior changes and new runtime-major support.

The existing TypeScript/Zod floors agree with
[Zod's documented TypeScript requirement](https://zod.dev/#requirements).
[Bun's Node compatibility documentation](https://bun.com/docs/runtime/nodejs-compat)
describes upstream API coverage; Toolgrain's own matrix determines its promises.
[npm documents engines and development engines separately](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#engines).
