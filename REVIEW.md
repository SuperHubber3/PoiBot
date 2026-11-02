# Repository review, 1 November 2026

This pass reviewed the current working tree, open pull requests, Dependabot alerts,
and the installed dependency graph. The checks focus on economy and cooldown
accounting, persistent interaction sessions, trading, waifu delivery, music queue
state, external API responses, command registration, and translations.

## Confirmed fixes

- Late failures from an old music playback request no longer discard a newer track or advance past it.
- Trade pickers acquire the session lock, validate the active stage and actor, and patch existing sessions rather than recreating them. Stale picker clicks cannot overwrite an offer or race its acceptance. Interactions acknowledge before database work.
- Cooldown refunds carry the original consumption window. A failure after an hour boundary cannot decrement the next hour's usage. Legacy timestamps within the original window remain refundable.
- Waifu pulls track outstanding reservations until delivery and session creation succeed. Failed later rolls, rendering, single-card delivery, and batch delivery refund undelivered pulls. Early error replies are awaited.
- Dependency updates include undici 6.29.1, ip-address 10.7.5, moment 2.31.0, concurrently 10.0.6, and shell-quote 1.12.0. The Zod/SuperAgent dependency chain is removed by replacing node-mcstatus with a small bounded client for the [same mcstatus.io endpoint](https://mcstatus.io/docs). The target allowlist remains in place. Responses have an eight-second timeout, a 256 KiB limit, field validation, and bounded displayed text.
- CI installs the lockfile, builds, runs tests, and audits dependencies using Node 24. Action revisions are pinned.

## Validation

- Build and TypeScript checking pass. All 38 tests pass, including isolated MongoDB regressions and mocked external boundaries.
- The real Sapphire loaders load all 82 commands and 19 interaction handlers. All 81 slash-command definitions serialize successfully with unique names.
- English and Turkish translation keys match. No referenced literal translation keys are missing. `git diff --check` passes.
- The local lockfile and the isolated security PR tree both report zero npm audit vulnerabilities.
- Controlled copies that restore the stale trade handler, old refund-window filter, or old music failure handling fail their regression checks. The corrected working tree passes.

## Pull request and remaining limits

[PR #40](https://github.com/SuperHubber3/PoiBot/pull/40) now contains only the security
updates, Minecraft status client and tests, Discord typing compatibility fix, and CI.
Its isolated tree builds, passes its two tests, and reports zero audit vulnerabilities.
The chatbot and other local fixes remain uncommitted as requested. GitHub's 21 open
Dependabot alerts remain open until the fixed dependencies reach the default branch.
CI and CodeQL passed for head `7bf280be982fb1c823dced72c627d0657990b9d6`.
The PR still requires reviewer approval.

The bot has not been restarted or deployed. This pass did not exercise live Discord
or Lavalink delivery. Refund compensation still depends on database availability;
crash recovery across multi-document economy operations is not certified by these
checks. No external CodeRabbit review was requested or run in this pass.

## Previous review, 8 September 2026

Reviewed the bot locally and ran CodeRabbit over separate command and core snapshots to stay within its 150-file limit. The snapshots contained source, tests, locales and project metadata; they excluded credentials and runtime data. Follow-up reviews checked the fixes. The last focused pass, covering the batch-refund change, reported no findings. This is a review of the working tree, including the new chatbot, rather than a certification that every runtime path is fault-free.

Confirmed fixes:

- Data integrity: atomic wish/VIP purchases; guarded legacy waifu price updates; tycoon repairs that preserve concurrent upgrades; marriage cleanup restricted to the observed couple; expired-session cleanup that cannot delete a renewed session.
- Action failures: safer blackjack setup refunds; correct dealer-natural payout; waifu skip compensation and explicit action dispatch; refunds for undelivered batch pulls; failed purge operations reported as failures.
- Concurrency: one boop per recent-speech token; one giveaway draw at a time, with the winner retained for announcement retries and newer giveaways protected from recovery writes.
- Discord interactions: early acknowledgement for several database/REST operations; public component messages suppress unintended mentions; safer user lookup and guild-only profile registration; bounded, validated generated stories.
- Music: stopping during autoplay cannot restart playback; failed tracks bypass repeat; idle skips cannot wedge subsequent skips; volume state updates before panel rendering; transient panel-edit failures retain the panel.
- Smaller defects: reaction word boundaries, malformed picker page numbers, unsupported component actions and language input validation.
- Dependencies: compatible security updates, with zero vulnerabilities reported by `npm audit`.

CodeRabbit suggestions were checked against the implementation. The deleted temporary-directory assertion is intentional; the audit destination remains opt-in; story text uses Components V2 rather than ordinary message content. Empty collection callers already guard the picker. Current session callers use one storage backend per key, so a proposed backend-switching redesign was not applied. Cosmetic refactors, missing optional artwork and suggestions to relax strict model-output validation were also left out.

Validation: the build and all 28 tests pass; `git diff --check` is clean. Coverage includes regression tests against an isolated MongoDB instance, plus mocked Discord/Lavalink boundaries. Tests cover shared chatbot memory, inactivity activation, the restricted Codex invocation, race conditions, payouts, message payloads and playback state. Live Discord delivery, a live Codex response, Lavalink connectivity and process-crash recovery were not exercised. The bot has not been restarted or deployed; chatbot generation remains disabled until `CHAT_ENABLED=true` is configured.

Refund compensation still depends on database availability. Batch refunds continue after individual errors and log failures, but failed cooldown-refund writes are not durably queued for later reconciliation.
