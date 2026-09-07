---
name: outbound-truth
description: Use when writing or reviewing anything customers or outsiders will read — README feature claims, changelogs and release notes, announcement or launch copy, user-facing help docs, pricing/landing-page copy, privacy-policy capability claims — or when the user asks "can we say this?", "is this claim true?", "does the copy overclaim?". Documents the outbound-truth discipline: every capability claim in an outward-facing artifact must trace to shipped code or recorded evidence; an unverifiable claim is a finding; an overclaim forces Not yet. This is the canon the outbound-truth-critic audits and /sync-docs, /release, and /user-docs apply — one discipline, not per-command paraphrases.
---

# Outbound truth

Everything a customer reads about the product is a **claim**, and for a one-person company
every one of those claims is written by the same tired person who wrote the code. This skill
is the canon for keeping them honest: **a capability claim in an outward-facing artifact must
trace to shipped code or recorded evidence — or it doesn't ship.** It extends the report-card
rule ("the grade follows the findings; never inflate") outward, to what *customers* are told.

This is the pack-wide form of `/sync-docs`' "never invent capabilities" rule. Commands apply
it; the `outbound-truth-critic` audits existing artifacts against it; this file is the single
definition both point to.

## What counts as outward-facing

Anything whose reader **cannot check the code** and will act on the words alone:

- README / project-page **feature claims** (the parts that sell, not the build instructions)
- **Changelogs and release notes** (`/release` Step 2 writes these)
- **Announcement / launch copy** — posts, emails, app-store descriptions
- **User-facing help docs** — getting-started guides, how-tos, FAQ
- **Pricing / landing-page copy**
- **Privacy-policy and compliance claims** ("we don't store X", "data is encrypted at rest")

Internal docs (architecture notes, `CLAUDE.md`, runbooks) are `/sync-docs`' ordinary drift
work — still kept true, but their reader can verify against the repo. The outbound reader
can't; that asymmetry is why the bar here is a *gate*, not a style preference.

## The trace rule

Every capability claim must trace to one of these **evidence classes**:

1. **Shipped code** — the feature exists at a real path, on the branch that ships.
2. **A passing check** — a test or verified report card covering the claimed behavior.
3. **A recorded fact** — a ledger entry (`docs/progress/**`), a release record, a
   `DECISIONS.md` line, a measured number with its source.

And three rules govern the tracing:

- **Softeners don't rescue a claim.** "Helps you export to PDF" still claims PDF export
  exists. Hedged, implied, or future-tensed-as-present claims trace or they're findings.
- **Numbers need provenance.** "10x faster", "bank-grade", "trusted by hundreds" — a number
  or superlative without a recorded source is an unverifiable claim, not color.
- **Absence claims are claims too.** "We never store your data" is checkable against the
  code and config — and *must* be checked; a false absence claim is the worst overclaim.

## Verdict mapping (for any reviewer or critic applying this)

| Situation | Verdict |
|---|---|
| Claim traces to an evidence class | Pass |
| Claim is plausible but nothing on disk verifies it | **Finding** — `[UNVERIFIED]`, named per claim |
| Claim describes a capability that does not exist / isn't shipped | **Blocker — the artifact is Not yet** |
| Artifact underclaims (ships more than it says) | Never a blocker — note it as an opportunity |

Overclaim severity is absolute: one invented capability forces **Not yet** no matter how
polished the rest of the copy is, because the reader will act on it. Underclaiming is always
safe — the discipline only ever pushes copy *toward* reality, never toward inflation.

## How consumers apply it

- **`/sync-docs`** — its "never invent capabilities" hard rule *is* this discipline applied
  per-command; a doc claiming what the code lacks is flagged, never "made true".
- **`/release`** — every changelog line traces to a ledger `complete` line or the diff; a
  release note never announces what didn't ship.
- **`outbound-truth-critic`** (via `/audit`) — sweeps the outward-facing artifacts that
  already exist and reports untraceable claims as ranked findings.
- **`/user-docs`** — every capability the help docs describe traces to an evidence class above
  (usually the shipped, user-reachable surface itself) before it's written; where behavior is
  unclear the doc says less, never guesses.
- **The `launch-kit` module's `/launch-kit`** (if installed) — and anything else that drafts
  outbound copy — gates its drafts against this rule before offering them; overclaim = the
  draft isn't offered.

## Boundaries

- **Truth, not tone.** Voice, persuasion, and formatting are the writer's business; this
  discipline gates only whether claims trace. Better copy is welcome — invented copy isn't.
- **Not legal review.** Checking a privacy claim against the code is engineering; whether
  the policy satisfies a regulation is a lawyer's call — say so when it comes up.
- **Evidence, not memory.** "I'm pretty sure we built that" is not an evidence class — the
  trace is to disk, exactly like every other gate in the pack.
