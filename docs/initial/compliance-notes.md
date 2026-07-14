# Compliance Notes

**Companion to:** [prd-ugc-intelligence.md](prd-ugc-intelligence.md)
**Status:** Draft v1.0 - engineering working notes, not legal advice. Every position below needs review by counsel before Phase 3.

---

## What makes this system legally different from a spreadsheet

Three things, and each of them is load-bearing.

It processes biometric-adjacent personal information - faces, voices, names - belonging to people who are not the client and not the agency. It applies an automated score to those people's work, and that score influences whether they receive paid amplification, which for many creators is a material part of campaign compensation. And it sends that personal information to an overseas model provider for processing.

Any one of these on its own is manageable. Together they place this system inside the part of the Australian Privacy Act that changed most recently and continues to change through December 2026.

---

## Automated decision-making

The Privacy Act reforms introduce transparency obligations for substantially automated decisions that significantly affect an individual's rights or interests, with the privacy-policy disclosure requirement commencing in December 2026.

**The exposure.** A creator whose content is scored low, and who consequently does not receive paid amplification, has had a decision made about them that affects their earnings. If that decision is substantially automated, it falls within scope.

**The design response, which is why REQ-021 and REQ-037 are hard constraints rather than product preferences.** The system does not decide. It recommends. Every Gate A verdict of `APPROVED` requires a human click. Every Gate B recommendation passes through a named human reviewer before it reaches a client, and the reviewer, the timestamp, and any modification are recorded. The client, not the system, allocates the spend.

For this to be more than a legal fiction, the human step has to be real. A reviewer who approves a queue of forty in ninety seconds has not exercised judgement, and a regulator would be right to say so. The triage sort in REQ-019 exists partly for this reason: it puts the decisions that need thought at the top, so the human step is where it matters rather than uniformly perfunctory. Override rate by cohort, tracked in the eval plan, is the internal signal for whether the human step has decayed into a rubber stamp.

**What to do now, ahead of December 2026.** Draft the privacy-policy language describing the kinds of personal information used in the scoring, the kinds of decisions the system informs, and the human review step. Do it in Phase 2, not Phase 5, because writing it will surface design assumptions that are cheaper to change early.

---

## Cross-border disclosure - APP 8

Creator content is processed by an overseas model provider. That is a disclosure of personal information to an overseas recipient, and APP 8 makes the discloser accountable for the recipient's handling of it unless an exception applies.

**Three viable paths, in rough order of preference:**

The first is APP 8.2(b) - informed consent, obtained from the creator, after being expressly told that the overseas recipient will not be required to comply with the APPs. This is the standard path and it belongs in the creator agreement, not in a checkbox at upload time. It has to be specific about what is disclosed and to whom.

The second is contractual - relying on the provider's terms and a reasonable-steps assessment. Weaker, more work, and it does not remove accountability.

The third is architectural - process on-shore. This is the clean answer and the expensive one, and it is worth pricing before dismissing it, because at the volumes in the tech spec's cost section the model spend is trivial and the compliance simplification is not.

**The decision is required before Phase 3**, because Phase 3 is when creator content first meets a model at scale. It is listed as an open question in the PRD because it has legal, cost, and product consequences and is not an engineering call.

---

## Creators under 18

**Excluded entirely.** V6 in the rubric, enforced at Gate A by a check against the creator record, not by inference from the content.

Social Soup and comparable agencies run consumer campaigns, and consumer campaigns attract young creators. The Children's Online Privacy Code takes effect in December 2026, and separately, applying automated scoring to a minor's likeness and voice, then using that score to influence whether they are paid, is not a position worth defending.

The exclusion is checked against the stored creator record. It is not inferred from the video, because inferring age from a face is both unreliable and independently a form of processing nobody wants to have to justify. If the creator record does not establish age, the record is incomplete and the submission does not enter AI scoring - it goes to human review. Fail closed.

This has an operational consequence: creator onboarding must capture and verify age before a creator can be assigned to a campaign whose submissions will be scored. That is an upstream change to ClientHub's creator record, and it belongs in Phase 1.

---

## Disclosure - the V1 veto

Australian influencer disclosure obligations sit across the Australian Consumer Law's prohibition on misleading and deceptive conduct, ACCC guidance on influencer marketing, and the AANA Code of Ethics §2.7 requirement that advertising be clearly distinguishable as such. The ACCC has run active sweeps of influencer disclosure and has been explicit that a disclosure buried in a caption, hidden behind a "more" link, or rendered in a hashtag block is not adequate.

**What this means for the detector.** Presence is not the test. Prominence is. A `#ad` in the eleventh hashtag of a caption is present and inadequate. The compliance lane therefore checks on-screen text, caption position, and spoken audio, against platform-specific prominence expectations, and the 0.98 recall target in the eval plan reflects that a miss is a client-facing regulatory exposure while a false positive costs thirty seconds.

**Re-check at Gate B is not redundant.** A submission approved with disclosure in the on-screen text can be published without it - the creator re-exports, uses a different cut, or the platform's editor strips the overlay. REQ-034 exists because the compliant artefact and the published artefact are different objects, and it is the published one that carries the exposure.

---

## Usage rights - the V4 veto

ECHO's `H2` red line states the rule that most implementations quietly collapse: republishing user content requires a recorded permission entry, public posting and tagging and branded-hashtag use are never permission, and **organic consent never covers paid use**.

The `RightsGrant` table in the tech spec encodes this as types rather than a boolean. `organic_publish` does not imply `paid_amplification`. There is no inference path from one to the other, no configuration that enables one, and no score high enough to bypass the check. A post with no unexpired `paid_amplification` grant is excluded from the amplification recommendation entirely and displayed as `blocked_rights` with the missing grant named, so the manager can go and get it rather than wondering why a good post is missing.

Every grant requires `evidence_uri` pointing at an actual signed instrument. A grant without evidence is not a grant.

**The commercially uncomfortable consequence.** The highest-AWS post in a campaign will sometimes be blocked on rights, and a client will ask to boost it anyway. The answer is to obtain the grant, which takes a day. The system's job is to make the missing grant visible early enough that the day is available.

---

## Untrusted input as a compliance control

The prompt-injection surface described in [ADR-0002](adr/0002-two-gate-scoring-architecture.md) is a compliance issue before it is a security issue.

If a creator can influence a disclosure determination by writing an instruction into their caption, then the compliance gate is not a control. It is a suggestion, and the agency's representation to the client that submissions are checked for disclosure is not true.

This is why the vetoes are computed in application code from extracted features and stored records, why the model cannot clear a veto, and why the adversarial suite in the eval plan is a permanent regression test rather than a one-time review. Any finding where model output influences a veto outcome is a P1, because it is a finding that a stated compliance control does not exist.

---

## Data retention and creator access

Creator content, extracted frames, transcripts, and scores are personal information under the Act. APP 11 requires reasonable security steps and, for information no longer needed, destruction or de-identification.

**Practical positions to settle:**

Retention of raw media beyond the campaign's rights window has no product justification and creates ongoing obligation. Extracted `FeatureRecord`s are more defensible to retain, because they are what the Pattern Library is built from, but frames are images of a person and a transcript is their voice. De-identifying a `FeatureRecord` - keeping `cut_cadence_per_sec` and `filler_word_rate`, dropping frames and transcript - retains most of the analytical value and most of the risk reduction. This should be the default after the rights window closes, and it should be a scheduled job rather than an intention.

A creator has a right to access personal information held about them, which includes their VPS scores and the evidence attached. There is a reasonable argument that a creator should see their scores anyway, as feedback. There is a competing argument that exposing scores invites gaming. The access right does not care about the second argument. Design for the request arriving.

---

## The separation invariant

ClientHub is multi-tenant. The Pattern Library is scoped by `tenant_id` at the repository layer with no widening override, per the tech spec.

Beyond the data-boundary reasoning already stated, there is a specific commercial hazard worth naming. Where a tenant is an agency and that agency holds a minority-shareholding relationship with another entity in the portfolio, the separation is not merely a data-protection control - it is the thing that keeps a shareholding from becoming an information-flow allegation. Outcome data derived from one tenant's campaigns must not inform another tenant's scoring, and the constraint must be structural rather than a policy that someone can be persuaded to relax under commercial pressure.

Nothing about this system's value depends on relaxing it. Everything about its defensibility depends on not.

**The Knowledge API does not relax it, and the reason is worth being precise about.** A `Mechanism` crosses tenants because it never contained a tenant: it is mined exclusively from the public exemplar corpus, and no `OutcomeEvent`, `Pattern`, `PerformanceSnapshot`, or operational table is reachable from the synthesiser ([ADR-0006](adr/0006-mechanisms-and-the-warrant-ladder.md)). Component 4 therefore holds no tenant-scoped data, and **a bug in its tenancy check cannot leak a tenant's data, because there is none in the process.** That is a property of what is reachable, not of a controller's `where` clause, and it is the only basis on which a knowledge surface may be exposed outside ClientHub.

Two things were considered and refused, and both would have looked reasonable in a design review. **Meta-analysing per-tenant effect sizes** without moving row-level data is the textbook answer and is the wrong one here: a pooled effect size is outcome data at lower resolution. So is **publishing a count** — "3 of 5 tenants confirmed this pattern." At five tenants with distinguishable verticals, either is re-identifiable in practice. Revisit if the tenant count reaches the dozens, where a k-anonymity argument becomes available. It is not available at five.

---

## The knowledge layer's own privacy surface

The internal corpus is content submitted under a creator agreement. **The exemplar corpus is not.** It is public posts by identifiable creators who have no relationship with this agency, never consented to anything, and in many cases do not know the corpus exists. Serving that corpus through an external API is a materially different act from mining it internally, and it is the newest exposure in this system.

**What Component 4 serves, and what it does not.** `GET /api/knowledge/mechanisms/{id}/exemplars` returns a public post URI, a creator handle, an observation date, and a boolean: did this post satisfy the predicate. It returns **no frames, no transcript, no face, no on-screen text, and no extracted `authenticity_signals`.** Those are the personal information; the boolean is an observation about an artefact. A mechanism's evidence is a set of counts, and counts are what leaves.

**When the source post is deleted, the pointer dies and the counts survive.** The prevalences were computed at `corpus_snapshot_sha256` against an immutable artefact, so a withdrawn post does not silently change a published mechanism's evidence. `/exemplars` returns the dead URI marked `unresolvable`. This is the honest behaviour and it is also the only one consistent with the immutability rule: a client told something under `beauty.tiktok.m3` must be able to reconstruct what they were told.

**A creator whose public post grounds a mechanism has not been scored, ranked, or paid differently.** The automated-decision analysis above does not reach them, because no decision about them was made. What was made is an observation about a piece of content they published. That distinction is real, and it is also the distinction that will be tested first if this surface is ever pointed at a person rather than a corpus. **The line to hold: a mechanism is a claim about content structure, never about a creator.** A `feature_predicate` that references creator identity, follower count, or demographic proxy is not a mechanism and must fail review.

**The source allowlist governs this too.** Per [ADR-0001](adr/0001-trend-signal-sourcing.md), a source enters the exemplar allowlist only where its terms permit the access pattern used, and the allowlist is a config artefact under version control, reviewed like code. Serving a URI is a different access pattern from reading one. **The allowlist review must therefore ask both questions**, and where a source permits ingestion but not redistribution, C4 serves the counts and withholds the URI.

**Untrusted text leaves the system here for the first time.** A `Mechanism.statement` is model-drafted prose grounded in exemplar captions and transcripts, which are untrusted input under [ADR-0002](adr/0002-two-gate-scoring-architecture.md). Three controls apply: it is fenced as data in the drafting prompt; it is never machine-consumed downstream; and **a named human ratifies it before it is served.** Only the third would survive a determined prompt injection, which is why `ratified_by` is a required schema field and not a workflow step. `ratified_at` is the compliance artefact — the record that a person, not a model, decided this sentence could be published in the agency's name.

**Needs counsel before Phase 6, not before Phase 3.** The questions are narrower than the APP 8 question but they are not zero: whether serving a public post URI to a tenant's automated client constitutes a disclosure of personal information; whether the creator handle is necessary at all (it is not — consider removing it); and whether the source allowlist's terms review has been performed against *redistribution* rather than only *access*.
