---
name: veto-verdict-integrity
description: Use whenever a change touches vetoes (V1–V6), the verdict engine, submission approval, compliance checks (disclosure, claims, brand safety, rights records, minors), model prompts or model-output handling, rubric-v1.json, or compliance-notes.md. The hard rule — vetoes and verdicts are computed in deterministic application code; the model may raise a suspected veto but may NEVER clear one; no auto-approval exists. Mandatory before writing any scoring, compliance, or approval code, and before editing the docs that define them.
---

# Veto & Verdict Integrity

## The invariants

1. **Vetoes are computed in deterministic application code (C#)** from extracted features and stored records — never by the LLM (REQ-010/011). The six vetoes: V1 disclosure, V2 claim integrity, V3 brand safety (absolute, no carve-out), V4 rights record, V5 technical spec, V6 minor creator.
2. **The model may raise a `suspected_veto` for a human; it may never clear, downgrade, or influence a veto.** Model output is not an input to veto computation, under any configuration. Any code path where it is = **P1**.
3. **Any veto ⇒ `REJECTED` at Gate A / `EXCLUDED` at Gate B.** A veto is a block, not a low score. V6 ⇒ `EXCLUDED_FROM_AI_SCORING`, age read from the stored creator record only, never inferred from content, **fail closed** (incomplete record → human review).
4. **No auto-approval, ever** (REQ-021, won't-change). Every `APPROVED` carries `human_approved_at` from a real human click. An `APPROVED` without it is invalid. This keeps the system outside the Privacy Act's "substantially automated decision" scope — the human step has to be real (override rate by cohort is the decay signal).
5. **Exactly one verdict per submission**, from the deterministic verdict engine — the only place a verdict comes from. The model returns criterion scores, never a verdict. Verdict logic: any veto → REJECTED; BAS < 60 → ≥ REVISIONS_REQUIRED; hook_strength < 50 → ≥ REVISIONS_REQUIRED (hard gate, applies even when audio-degraded).
6. **Schema/parse failure ⇒ `NEEDS_REVIEW`** — retry once, then NEEDS_REVIEW. Never a default score, never approval. Out-of-range score → clamp, log, flag `anomalous`, exclude from calibration.
7. **Creator-supplied text is untrusted** (captions, transcripts, on-screen copy, trend rationale, evidence URIs): fenced as data with `authority="untrusted"`, schema-validated output, never reaching a veto, verdict, or budget allocation. A caption asserting disclosure at a false timestamp is a live attack on a regulatory control — this is a compliance control before a security one.
8. **V1 disclosure is re-checked at Gate B on the live post** (REQ-034) — the compliant artefact is not the published artefact. Recall ≥ 0.98, precision ≥ 0.85; all tuning resolves toward recall. Prominence, not presence (a `#ad` in the 11th hashtag fails).

## Why

Vetoes implement Australian regulatory controls (ACL disclosure, AANA §2.7, Privacy Act minors provisions, usage-rights law). A model-influenced veto is a compliance control that does not exist. The adversarial suite in `eval-and-calibration-plan.md` is a permanent regression test on this architecture — every adversarial input must produce an *unchanged* veto outcome.

## Where the canon lives

- `docs/initial.past/rubric-vps-v1.md` (Lane 1 vetoes, verdict logic) · `docs/initial.past/schemas/rubric-v1.json` (`vetoes`, `model_authority.may_never`, `untrusted_inputs`)
- `docs/initial.past/component-2-scoring-amplification.md` §2.2 (compliance gate), §2.4 (model orchestration), §2.5 (verdict engine)
- `docs/initial.past/compliance-notes.md` · ADR-0002 · PRD REQ-010/011/012/013/015/021/034

## Anti-patterns

- A "confidence threshold" above which the model's veto assessment is trusted → violates invariant 2, no threshold makes it legal.
- Batch-approve / approve-all endpoints, default-approve on timeout, or approval driven by a queue job → violates invariant 4.
- Inferring age, rights, or disclosure from video/caption content instead of stored records → violates invariants 3 and 7.
- Any veto check that degrades open (skipped when extraction is down) — extraction down ⇒ NEEDS_REVIEW; compliance still runs on caption/metadata.

While code doesn't exist yet, these invariants gate **doc edits**: a change to `docs/initial.past/` that weakens any of them must update the owning ADR and be flagged loudly — see CLAUDE.md rule 8.
