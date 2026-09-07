# Shaping brief — respin-m2 (The Brain: Onboarding and Profile)

**Request (as stated):** "continue implementation of respin" — which, from the build-plan's state (M0 + M1 complete, audit remediation R0–R4 closed), means **M2**.

**Real job:** *"I want the thing to sound like me — and I want to see, and correct, exactly what it thinks I am before it starts writing in my voice."* A creator's brain is the product's most sensitive object and its whole differentiator. The job is not "build an onboarding form"; it is **turn 20 minutes of a creator's own material into an inspectable, correctable model of their voice and strategy that they trust enough to let write for them.**

**Chosen scope:** **Full M2 including library seeding** (owner-chosen 2026-08-19) — the build-plan's M2 in full, plus the two things it depends on that the build-plan does not itself name: the profile tenancy cage, and a minimal LLM adapter.

What that means concretely:

1. **The profile cage — a hard entry gate, first.** `VerifiedProfileId`, `WorkspaceScope.profile()`, composite scoping at every profile accessor, no `trustProfileId`, non-enumerating refusal, and tests P1–P6 shown failing against un-caged code before any M2 schema or route is written. Design already recorded at `docs/plans/respin-m2-profile-cage-design.md` (audit #23, R-25/R0). **Nothing else in M2 starts until this is green.**
2. **`creator_profiles` + `brain_docs` schema**, per tech-spec §2: `brain_docs (profile_id, kind, version, content jsonb, source_evidence jsonb, status)`, append-only versions, active = max version with `status='active'`, `kind='voice'|'strategy'|'performance_meta'|'killtest'`. Every profile-grained table carries a real `workspace_id` column with a real FK (cage rule 3). Per-tier profile caps per REQ-A01 (Free 1 / Creator 1 / Pro 1 / Studio 5).
3. **A minimal `packages/llm` adapter** — Anthropic behind the provider adapter (R-5/tech-spec §1), Zod-validated structured output, no streaming yet (that is M3). M2 needs it because onboarding *infers* brain fields; the build-plan assumes it without naming it.
4. **Onboarding wizard (REQ-B01/B02/B03)** — structured interview → paste/links of 5–10 of the creator's own past posts → optionally 2–3 reference posts → **review-and-confirm screen showing source evidence and a confidence level per inferred field**, each confirmed or edited before the brain activates. Under 20 minutes with realistic inputs. No sensitive personal trait is ever silently inferred.
5. **North-star metric declaration (REQ-B03)** — declared at onboarding, changeable later; it is the yardstick every later output and result is judged against.
6. **Brain editor pages** (voice, strategy, killtest) where **every edit creates a new version** and the old version stays readable.
7. **Brain export (REQ-A04)** — complete, readable JSON + markdown, all four documents.
8. **Seed the shared framework library** from the generalised F1–F9 mechanism set — **unblocked by R-29** (owner-confirmed 2026-08-19, mechanism-level only). Seed is a checked-in reviewable data file; rows carry `visibility='shared'`, `owner_profile_id=NULL`, curator-approved per REQ-D02, and an assertion proves no seeded row carries personal-specific fields.

**10-star sketch (aim, not commitment):**
- Paste a channel URL and the brain drafts itself — the creator's job becomes *correcting* rather than *supplying*.
- The confirm screen shows, per field, the exact sentence from their own post that produced it — evidence you can click through to, not a confidence number you have to take on faith.
- The brain diff view: "here's what changed about how I understand you, and why" on every version.
- REQ-B04 — onboarding ends by generating the creator's first three ideas through the new brain, so the aha lands inside the first session.

**North Star alignment:** advances the Goal's **item 1, the durable-order first item** — *"a per-creator brain that is inspectable, confirmable context — never weights (R-8); nothing updates it silently."* M2 is the milestone where that stops being a doc-set promise and becomes a screen. It also builds the substrate items 2 and 3 depend on (there is no evidence loop and no library contribution without a profile and a brain). Current focus in `NORTH_STAR.md` names M2 as next.

**Non-goals (now):**
- **REQ-B04's first-three-ideas** — needs M3's generation pipeline (`packages/modes`, kill test, credit debit in-transaction). Deferred to M3 with the aha-moment rationale preserved; M2's onboarding ends at an activated, confirmed brain.
- **Streaming UI and the seven Studio modes** — M3.
- **Promotion proposals from results** — M5; M2 stores the `promotion_proposals` shape only if the brain-editor versioning needs it, and emits nothing.
- **Studio seats / roles (REQ-A02)** — M6 via Better Auth's organizations plugin. M2 assumes one owner per workspace, and the cage is designed so seats do not re-plumb consumers.
- **Account deletion (REQ-A04's deletion half)** — M6. Export ships here; deletion does not.
- **Private frameworks (REQ-D05, Should)** — M2 seeds the shared library; `visibility='private'` is schema-only.
- **The parked product lines** (`src/` UGC Intelligence, `cutdown/`) — untouched.

**How this fails (pre-mortem):**

1. **The cage gets retro-fitted.** The single largest risk, and the audit already named it (#23): if any brain route is written before `VerifiedProfileId` exists, every route written in between needs re-auditing plus a migration. The design's own stop condition says P1–P6 must exist as *failing* tests first — and "failing" has to mean demonstrated red against un-caged code, not asserted. **This repo's 2026-07-30 lesson applies directly: fix the class, not the field — a guard whose promise depends on an invariant holding elsewhere is the guard that fails.** P4 (per-accessor composite scoping) is the test that catches what P1 cannot.
2. **The confirm screen becomes theatre.** REQ-B02 says every inferred field shows *source evidence* and a *confidence level*. The failure mode is a confidence number the model emitted about itself, next to an evidence field that paraphrases rather than quotes — which looks like provenance and is not. If a creator cannot trace a field to the actual text that produced it, R-8's "inspectable, confirmable context" is false and the product's core differentiator is a UI affectation. **Must-answer before code: what exactly is stored in `source_evidence`, and is the confidence derived from something checkable or self-reported?**
3. **Versioning that is append-only in the schema and mutable in practice.** `brain_docs` is designed append-only with `active = max(version) where status='active'`. The failure is an editor that "updates the active doc" through a path that looks like a version bump but reuses a row, or an activation that leaves two rows active for one `(profile_id, kind)`. This is the same class as M1's ledger invariant, and it deserves the same treatment: a DB-level constraint plus a concurrency test, not a comment. **Must-answer: is "one active version per (profile_id, kind)" enforced by a partial unique index, or by application code that a race can beat?**

*(Adjacent, worth stating: an LLM adapter arriving in M2 means M2 is the first milestone that can spend real tokens. M1 deliberately built metering first — so onboarding inference must debit through the existing ledger, or be explicitly and recordedly free. That is a plan-level decision, flagged here.)*

---

**Next step:** `/create-plan respin-m2` reads this brief as its starting contract.
