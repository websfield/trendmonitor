# Component 4: Knowledge API

**Serves beliefs.** Reads published `MechanismLibraryVersion` artefacts and returns them over an authenticated HTTP surface, so that the knowledge this system accumulates is reachable at the moment a brief is being written rather than at the moment a quarterly report is being printed.

**Talks to Component 1 through:** [Contract E](integration-contract.md#contract-e-mechanismlibraryversion-c1--c4) — an immutable, content-addressed artefact in blob storage. That is the whole of its input.

**Decided by:** [ADR-0007](adr/0007-the-knowledge-api-boundary.md) · **Entity defined by:** [ADR-0006](adr/0006-mechanisms-and-the-warrant-ladder.md) · **Schema:** [`schemas/mechanisms-v1.json`](schemas/mechanisms-v1.json)

**Cannot:** write anything, anywhere; read the Pattern Library, the OutcomeEvent log, C1's internal corpus, or any ClientHub operational table; serve a number that a circuit breaker governs; be called by Component 2.

---

## 4.0 The property everything else rests on

**C4 holds no tenant-scoped data, so a bug in C4's tenancy check cannot leak a tenant's data.**

This is not a claim about C4's code. It is a claim about what is reachable from C4's process. Mechanisms are tenant-neutral *by construction* per ADR-0006 — mined exclusively from the public exemplar corpus and from trend signals, with the schema forbidding the fields through which outcome data could arrive. C4 is granted read access to exactly one artefact-store prefix.

The tenant API key is therefore **entitlement and rate-limiting, not isolation.** There is nothing here to isolate. This is the entire reason a knowledge surface can be exposed outside ClientHub at all.

If C4 ever appears to need a second data source, the design is wrong and the answer is not a second grant.

---

## 4.1 Artefact Resolver

**Responsibility.** Resolve `active_version` for a `(vertical, platform)` pair from the pointer table, load the immutable artefact, verify `sha256`, cache.

Keys carry **no tenant axis**: `beauty.tiktok.m3`, not `tenant_x.beauty.tiktok.m3`. A key with a tenant on it would mean a tenant's data got in.

**Immutability makes caching free.** Artefacts are content-addressed. A response served under `beauty.tiktok.m3` is reconstructible forever, which is what lets C4 be cached to the edge indefinitely and what makes a falsification auditable after the fact: the corpus snapshot that produced the counts is named on the artefact.

**Rollback is repointing `active_version`, not editing an artefact.** A mechanism falsified in `m4` still resolves under `m3`, because a client who read it under `m3` must be able to reconstruct what they were told.

**Failure.** Artefact store unreachable → serve the last verified cache with `stale_as_of` on the response. No `active_version` for a cohort → `200` with an empty collection and `coverage: "no_library"` (see §4.4). Never a `500` that a caller will read as "the knowledge is broken."

---

## 4.2 Warrant Filter

**Responsibility.** Decide what is served. This is a read of a decision already made, not a decision.

| `warrant` | Served as active | Present in artefact |
|---|---|---|
| `conjectured` | no | yes |
| `recurrent` | yes | yes |
| `contrasted` | yes | yes |
| `falsified` | **no** | yes, forever |
| `retired` | no | yes |

C4 does not compute a warrant, promote one, or override one. C1 computes it deterministically from corpus counts; a named human ratifies the `statement` before any rung is served. `falsified` and `conjectured` mechanisms ship inside the artefact for auditability and are never returned as active — the same shape as `insufficient_evidence` patterns inside a `PatternLibraryVersion`.

**No `?include_unratified=true`.** There is no parameter, no admin path, and no internal-caller exemption that serves an unratified statement, or one whose `ratification_note` is empty. Model-drafted prose does not leave this system on a model's say-so.

**A ratified statement is the *only* thing standing between a poisoned exemplar caption and a published claim in the agency's name.** Fencing stops the naive injection; the forbidden-verb lexicon stops causal language and nothing else. An injected sentence that avoids *causes* and *lifts* passes every automated control. That is why ratification is a schema-required field with a recorded reason, why the ratifier's volume and latency are reported as a decay signal, and why the eval plan carries an adversarial suite whose sharpest case is an injection that obeys the lexicon perfectly.

---

## 4.3 Response Composer

**Responsibility.** Ensure no response is a bare fact.

Every mechanism in every response carries, non-optionally:

| Field | Value | Why |
|---|---|---|
| `warrant` | `recurrent` \| `contrasted` | Governs the verbs a reader may use |
| `provenance.label` | `Proxy-selected, Measured-evaluated` | Top-decile membership came from a keyless read (ADR-0001, Tier 3). The predicate was evaluated deterministically from the media. |
| `never_tested_against` | `content that was attempted and failed` | The exemplar corpus is a sample of winners. Not removable. |
| `falsifier` | the observation that would sink it | A mechanism without one is a caption |
| `mechanism_library_version`, `sha256` | | Reconstructibility |

**There is no `0-100` field anywhere in a C4 response, and no `effect_size`.** The schema forbids the key rather than nulling it, so adding one breaks validation instead of shipping quietly. Someone will ask C4 what a submission will score. C4 cannot answer; C2 can, and the number C2 produces is governed by a breaker C4 has no access to. The two surfaces answer different questions and it must be impossible to mistake one for the other.

`prevalence_ratio` **is** served, and is a **descriptive asymmetry on a proxy-selected sample**. It is not a lift. The response never uses the words *causes*, *lifts*, *drives*, or *predicts*.

**The tension there is real and is not resolved by wishing.** A bare `2.45` reads like a 2.45× multiplier, which is the same "the number travels, the label does not" failure that got `effect_size` refused. The difference is where the failure lives: an `effect_size` over Proxy engagement *aggregates a Proxy value into a magnitude* and breaches ADR-0001 at the point of computation, whereas a prevalence ratio divides two deterministic counts over a proxy-*selected* set and breaches nothing. What is left is misreading, which the wrapper mitigates and does not eliminate. A mechanism with no quantity could not be falsified, so the quantity stays and the risk is named. See [ADR-0006](adr/0006-mechanisms-and-the-warrant-ladder.md).

---

## 4.4 Coverage Reporter

**Responsibility.** Distinguish *nothing cleared the bar* from *nothing is happening*.

This is inherited directly from ADR-0004's hardest-won consequence: a trend feed showing six Reddit trends and no TikTok trends, presented without comment, reads as a claim that nothing is happening on TikTok.

An empty knowledge response is the correct early state and will be indistinguishable, to an impatient caller, from a broken one. So every collection response carries a `coverage` object:

```json
{
  "mechanisms": [],
  "coverage": {
    "state": "below_warrant_bar",
    "library_version": "beauty.tiktok.m1",
    "candidates_at_conjectured": 14,
    "blocking": "n_trends >= 2 not met for 11 of 14; n_creators >= 8 not met for 6 of 14",
    "corpus_last_refreshed": "2026-07-02"
  }
}
```

`coverage.state ∈ { served, below_warrant_bar, no_library, corpus_stale }`. A cohort where the corpus has not refreshed in 30 days reports `corpus_stale` rather than serving mechanisms whose prevalences were counted against a corpus nobody has looked at. A decaying library that nobody notices is the quiet failure mode of every system of this kind.

---

## 4.5 API Surface

Tenant-authenticated. Read-only. `GET` only — there is no verb that writes.

```
GET  /api/knowledge/mechanisms
       ?vertical=beauty&platform=tiktok&warrant=contrasted
     → { mechanisms[], coverage, library_version, sha256 }

GET  /api/knowledge/mechanisms/{id}
     → statement, feature_predicate, falsifier, warrant, evidence,
       provenance, never_tested_against, occasioned_by_trend_ids,
       ratified_by, ratified_at, valid_from, valid_to

GET  /api/knowledge/mechanisms/{id}/exemplars
     → [{ public_post_uri, creator_handle, observed_at, predicate_satisfied }]
       Never frames. Never a transcript. Never a face. See compliance-notes.md.

GET  /api/knowledge/mechanisms/{id}/history
     → warrant transitions with the corpus_snapshot_sha256 that caused each,
       including every demotion to `falsified`

GET  /api/knowledge/libraries/{version}
     → the immutable manifest, for reconstructing a response served months ago
```

**Auth.** Tenant API key or OAuth client credentials. The tenant identity is recorded for rate limiting and entitlement. It is not used to scope data, because there is no tenant-scoped data to scope.

**Rate limits and caching.** Responses are content-addressed and immutable; `ETag` is the artefact `sha256`, and `Cache-Control` is long. A `falsified` demotion changes `active_version`, which changes the `ETag`, which is how a withdrawal propagates within one cycle rather than one quarter.

**Versioning.** `mechanisms-v1.json` becomes a published contract the moment a tenant integrates against it. It bumps; it never mutates in place.

---

## 4.6 What C4 does not have

**No breaker dependency.** C4 does not read [Contract C](integration-contract.md#contract-c-breakerstate-c3--c2). Per ADR-0007, this is deliberate and it is a feature. A tripped breaker means *this scorer's numeric predictions have not demonstrated rank skill in this cohort*. It says nothing about whether a structural regularity in public content is real, because a mechanism was never a prediction and was never estimated from that scorer's outcome data. Wiring C4 to C3 would create a dependency that fails closed on data that was never at risk, and would imply a relationship between the two artefacts that ADR-0006 spends its length denying.

**No event emission.** [Contract B](integration-contract.md#contract-b-outcomeevent-stream-c2--c1-c2--c3) has exactly one writer and it is C2. C4 is read-only end to end.

**No process shared with C1.** However small C4 is — and it is the smallest thing in the system — it must not be deployed as a library inside C1. That would recreate at deploy time the request-time dependency on C1 that ADR-0005 exists to prevent, and would put an HTTP listener in the process holding every tenant's internal corpus. Service, container, or a job writing signed JSON to a CDN are all fine. Sharing C1's process is not.

---

## Failure semantics

| Failure | Behaviour |
|---|---|
| Artefact store unreachable | Serve last verified cache, stamped `stale_as_of`. Alarm. Never a bare `500`. |
| `sha256` mismatch on load | Refuse the artefact. Serve the previous verified version. **Alarm as a P1** — a mutated immutable artefact means the store is not what the contract says it is. |
| No library for a cohort | `200`, empty collection, `coverage.state = "no_library"`. Not a `404`. Absence of a library is not absence of a cohort. |
| No mechanism clears `recurrent` | `200`, empty collection, `coverage.state = "below_warrant_bar"`, with the blocking counts named. |
| Corpus not refreshed in 30 days | `coverage.state = "corpus_stale"`. Mechanisms still served, staleness surfaced. |
| A `contrasted` mechanism falsifies on refresh | Withdrawn from active responses **the same cycle**. Retained in the artefact. Visible on `/history`. No human step. |
| A caller requests a score | There is no field. There is no endpoint. This is a design property, not a validation error. |
| C1, C2, or C3 down | C4 unaffected. It reads an artefact store. |
| C4 down | Nothing else is affected. No scoring path, no compliance path, and no calibration path depends on C4 being alive. |

---

## What C4 never does

It never writes. It never calls C1, C2, or C3. It never reads a tenant table, the OutcomeEvent log, or the Pattern Library. It never serves an effect size, a VPS, an AWS, or any number a circuit breaker governs. It never serves an unratified statement. It never serves a `falsified` or `conjectured` mechanism as active. It never returns a face, a frame, or a transcript. It never reports an empty collection without saying why it is empty. And it never lets a mechanism reach a scorer — because a mechanism is a hypothesis about *why*, and a score is a claim about *how much*, and the entire architecture rests on those being different objects that were never allowed to touch.
