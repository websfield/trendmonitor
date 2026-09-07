# Plan review — respin-m2

**Verdict: NOT READY.** Two rounds run; `/create-plan` Step 6d's cap reached; residuals surfaced to the owner.

| Round | Tenancy | Billing | Learning | Compliance |
|---|---|---|---|---|
| 1 | BLOCK (D) — 5B/10C/7N | BLOCK (D) — 3B/7C/5N | BLOCK (D) — 3B/8C/5N | BLOCK (D) — 3B/6C/2N |
| 2 | BLOCK (D) — 4B/9C/6N | BLOCK (D) — 3B/12C/6N | BLOCK (D+) — 2B/9C/4N | BLOCK (D) — 1B/9C/4N |

**14 BLOCK -> 10 BLOCK.** Real closures, and new defects of the same class introduced by the fixes.

## What round 2 closed

- **The submitted-input store** (3 reviewers in round 1). `onboarding_inputs` is a real immutable table with `content_sha256`, re-validated inside the activation transaction. Compliance and learning both confirm closed.
- **Persisted `model_usage`** — success and failure, one row per HTTP call, `cost_state='unknown'` not `0`, `config_version` required, AC red when the write is removed. Billing: "nothing of substance is now only *returned*."
- **Phase 2 under the cage's stop condition** — verified by tenancy: depends on phase 1, both tables in `0011`, both have `workspace_id`, both in P3's named set.
- **`performance_meta` refusal moved to where the path is built** (`WritableBrainKind` + runtime check).
- **The cast hole on the brands** — P7 is implementable; tenancy verified only two brand-producing expressions exist repo-wide today.
- **The engineering/evidence split** — learning calls it "the strongest part of the revision"; no AC references the 20-minute figure, and the population is named.
- **The causal-claim check** — compliance: "the strongest AC in the plan set."

## Open BLOCKs after round 2

### Tenancy (4)

1. **P4's fixture cannot exist** — proved against Postgres 17 in three branches, one of which (`ON UPDATE CASCADE`) *fails silently* by producing an agreeing row. The plan asserts a mutation outcome without a mechanism that produces it, for the second round running. Fix: `DROP CONSTRAINT` inside a rolled-back transaction — disable the outer defence to prove the inner one — and state that `profile()`'s breach case is P1, not a planted row.
2. **The same-workspace, different-profile read is untested anywhere.** Every fixture is oriented at the workspace predicate; the `profile_id`-drop mutation is specified nowhere. This is the cage design's own opening example and REQ-A01's Studio case.
3. **Three creator-data write paths have no owning module** — creating `creator_profiles`, counting them for the tier cap, inserting `onboarding_inputs`. `ProfileScope.accessors` are all read-only and `app/**` cannot reach a table. Whatever fills the hole lands after phase 1's gate.
4. **`ProfileScope` is forgeable by the same cast the brand was.** `{...scope, profileId: otherId} as unknown as ProfileScope` compiles under strict, passes `no-explicit-any`, and P7 does not look for it.

### Billing (3)

1. **`creditCosts.onboardingBrainBuild` is live editable config no M2 code reads.** An admin can price it above zero via the raw-JSON admin editor and get free inference with no signal.
2. **The config data step can wipe `stripePriceMap` while AC-11 stays green.** `appendConfigVersion` `.parse`s a whole document against the new schema, so `migrate-config` must merge into the raw stored jsonb; the plan never says so. An implementation that appends `CONFIG_V1_SEED` + new keys passes the AC and silently drops every paying subscriber to `{tier: "free", reason: "unmapped_price"}`.
3. **The pause gate names no predicate and is placed where the authority is unreachable.** `hasOpenPause` is the authority (`state.ts` says so in terms); `isPausedSubscription` is explicitly "not used to gate money". `hasOpenPause` is not on the `@respin/credits` facade, so `app/**` can only reach the non-authority — and phase 5 forbids touching `packages/credits`. The AC cannot discriminate: the ordinary pause fixture writes both records, so both predicates agree.

### Learning (2)

1. **The four-kind activation survives in phase 5** — AC-1, the handoff, and verification steps 2-3 still say "all four kinds" while task 7 and AC-4 say three. Phase 3's `WritableBrainKind` makes AC-1 unimplementable, and the cheapest resolutions at implementation time are the two things round 1 blocked.
2. **`brain_docs` has an undefined, unguarded, unenumerated INSERT path** — phase 5 persists drafts as `brain_docs` rows, phase 3 exports one writer, and AC-15 enumerates `update` only.

### Compliance (1)

1. **The allowlist is host-scoped, not endpoint-scoped.** `fetch("https://www.youtube.com/watch?v=X")` + a scrape, or `youtube.com/api/timedtext`, passes AC-12 unchanged. Made likely rather than theoretical by D-M2-9 naming "the captions API" with no auth model, when `captions.download` requires OAuth ownership of the video — so the compliant leg cannot serve a reference post, and the engineer reaches for the endpoint that works. The guardrail's body pattern has no YouTube or transcript terms.

## Cross-cutting corrections to the plan's own claims

- **`PRD.md:135` does not say what the plan says it says.** "onboarding brain build 0 (included once per profile)" sits in a **credit-cost list** where every other entry is a price. "Included" is a pricing word: it states what the *first* build costs, not that a second is refused forever. The plan called its reading "a re-affirmation, not a decision" and cited the line as *the authority* for a hard cap — an invented threshold wearing a citation, in the section whose subject is provenance. **This needs an owner decision, not a re-reading.**
- **"Six `getActiveConfig` sites inside the webhook transaction" is five** (`webhooks.ts:588,786,1082,1197,1283`). The number was taken from a round-1 finding and propagated across five documents unverified. The conclusion is unaffected; the habit is the finding.
- **"Stripe retries indefinitely" is wrong** — roughly three days with backoff, then the endpoint is disabled. The grant is eventually *lost*, not delayed, which strengthens the case for the structural fix.
- **AC-6 and D-M2-5 contradict each other** (found independently by learning and tenancy): *agreement* compares model-extracted values; AC-6 requires those values to be varied without moving the enum. One is unsatisfiable, and the path of least resistance re-opens the laundering channel.
- **"Unrepresentable" overstates a TypeScript union** at a trust boundary — true only because a runtime Zod parse backs it, and the draft write path is outside that parse.

## The pattern worth recording

Round 1's findings were *missing dimensions*. Round 2's are largely **incomplete applications of round 1's own fixes**: `performance_meta` corrected in one place and left in three; REQ-B02 corrected in phases 3 and 5 and left in 6; the schema consolidated into phase 1 while creating a new unguarded insert path; a brand cast closed while the object that replaced it stayed castable.

That is the same shape this repo already recorded from M1's remediation: *"across seven gate rounds the reviewers found, in changes made by this review, one defect worse than the bug it replaced... a validator admitting the exact misconfiguration it claimed to prevent — twice."* The 2026-07-30 lesson — **fix the class, not the field** — is the one this plan keeps failing, in the plan documents rather than in code.

## Recommendation

The remaining findings are specific and mostly mechanical. The highest-value ones (P4's fixture, the same-workspace fixture axis, the missing write paths, `ProfileScope` forgeability) all land in **phase 1**, which is the entry gate everything else waits on. A third round scoped to phase 1 is worth more than a broad one.

Two things need the owner, not another reviewer:

1. **The `PRD.md:135` reading** — is a second onboarding inference refused forever, or priced?
2. **The captions leg** — ship paste-only in M2, or accept the OAuth-ownership constraint?
