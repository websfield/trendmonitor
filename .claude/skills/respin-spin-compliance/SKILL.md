---
name: respin-spin-compliance
description: Use whenever a Respin change touches trend ingestion (`packages/trends`, `TrendSource` adapters), the autopsy pipeline, the Spin action, the similarity gate, the kill test's honesty behaviour, or any integrity guardrail (REQ-I01–I05) — fake engagement, verbatim reproduction, invented personal specifics, performance guarantees, disclosure guidance. The hard rules — ingest from compliant sources only, never scraping closed platforms; a spin is never displayed without passing the similarity gate; unknown personal details render as `[check]`, never invented; no output is ever presented as a guarantee. Mandatory before writing any ingest adapter, autopsy, spin, or output-gating code, and before editing PRD §4E/§4I or tech-spec §3–4.
---

# Respin Spin & Source Compliance

This is the rule canon for the **Respin spin compliance** Critical Path. Its gate is
`.claude/agents/respin-compliance-reviewer.md`. Sources: `docs/initial/PRD.md` §4E
(REQ-E01–E08), §4I (REQ-I01–I05), REQ-C03, `docs/initial/tech-spec.md` §3 (steps 3–4),
§4, `docs/initial/decisions.md` R-3, R-4, `docs/initial/build-plan.md` M4. Scope is
Respin (`app/`, `packages/`).

Authored from the doc set before M0 — where a rule names a file that does not exist yet,
the rule governs the file when it lands.

## Why this path exists

The trend feature's entire defensibility is R-3: **Spin, never copy**. The owner asked
for "copy trending posts"; the recorded decision is capture → autopsy → adapt, because
platforms de-recommend unoriginal content, the corpus evidence says adapted mechanisms
outperform copies, and verbatim reproduction is a rights risk. Every rule here is either
a platform-policy position, a rights position, or an anti-slop position — and all three
are release gates, not aspirations. Build-plan agreement: no feature touching other
creators' content ships without its similarity gate and source-compliance check.

## The rules

### S1 — Compliant sources only (REQ-E01, R-4)

v1 ingests from exactly two adapters: `youtube` (Data API v3) and `submitted` (oEmbed
metadata + YouTube captions or creator-pasted transcript). **No scraping of closed
platforms, no downloading media in breach of terms.** M4's compliance criterion is
literal: the ingest layer contains adapters for exactly the compliant sources named in
tech-spec §4 and nothing else, plus a grep-level check that no scraping dependency
exists (the `respin-scraping-dependency` guardrail is the write-time echo). A third
adapter slot is reserved for a *licensed* provider — chosen by a decision entry, not a
commit.

### S2 — The similarity gate is a hard release gate (REQ-E04, REQ-I02, R-3)

A spin must change, at minimum: the subject matter, the hook wording, and one structural
element. Before display, output runs the similarity gate (n-gram overlap + embedding
thresholds from config) against the source transcript; **failure triggers rewrite, never
display**. Keep the growing fixture set of near-copies (build-plan standing risk 2) —
every gate change reruns it, and a deliberately-forced near-copy must be blocked in
tests. Original and spin display side by side.

### S3 — The kill test fails honestly (REQ-C03, tech-spec §3 step 3)

Every output passes the profile's KillTest before display. Hard-rule violations
(fragment triads, antithesis constructions, invented specifics without `[check]`,
over-long hooks where active) trigger **one** automatic rewrite, then surface honestly:
"everything died, here is why, here is a sharper angle" — never padding with filler.
Kill-test results are stored on the generation. The streaming UI marks output
"checking" until the buffered result passes.

### S4 — No invented specifics, no guarantees (REQ-I03, REQ-I04)

Unknown personal details render as `[check]` placeholders the creator fills — an
invented specific is a violation even when plausible. No predicted score or "why this
performs" text is ever presented as a guarantee of reach or sales; the weakest point is
always named. This binds affiliates too (REQ-H04): no virality promises on the product's
behalf — the outbound-truth skill is the pack-wide canon for the marketing surface.

### S5 — No fake engagement, no evasion, no concealment advice (REQ-I01, REQ-I05, REQ-E08)

No engagement automation, no auto-posting, no interaction with the creator's platform
account beyond analytics they authorise. Disclosure guidance is platform-appropriate and
never advises concealment. There is no config flag that weakens any of this.

### S6 — Autopsies are cached and attributed (REQ-E03, tech-spec §4)

One autopsy serves all users (cached on the trend item; second view costs zero). The
fixed order — hook mechanic → beats → ending → follow trigger — is the pipeline's
contract. Trend items carry score, channel baseline, and data window; stale items are
marked stale, never deleted (REQ-E06).

## Checklist before shipping a change on this path

- [ ] Ingest layer contains only the tech-spec §4 adapters; no scraping dependency anywhere.
- [ ] Similarity gate runs before any spin display; the near-copy fixture set passes and grew if the gate changed.
- [ ] Kill-test failure surfaces honestly; results stored on the generation.
- [ ] No invented specifics ([check] convention); weakest point named on every output.
- [ ] No engagement automation or concealment guidance entered any surface.
