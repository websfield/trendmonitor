# Phase 4 — The shared framework library seed (R-29)

**Depends on:** Phase 1 (the `frameworks` schema).
**Primary agent:** `respin-engineer`.
**Requirement IDs:** REQ-D01, REQ-D02, REQ-D04, REQ-A03.

> R-29 confirmed the boundary in writing on 2026-08-19. This phase is where that boundary becomes something a reader can check and a test can enforce — or where it becomes a sentence in a decision log that nothing obeys.

---

## Project Conventions Pinned (READ FIRST)

### Golden rules (from `CLAUDE.md`)

1. **Read before you write.** Never edit a file you haven't read; never state a "fact" about the code you haven't verified in the code.
2. **No secrets in code, commits, or logs.**
3. **Never destroy what you didn't create without explicit confirmation.**
4. **Fix causes, not symptoms.**
5. **Match the codebase.**
6. **Report honestly.**
7. **Small, verifiable steps.**
8. **Scale caution to blast radius.**
9. **Current facts beat trained memory.**

### Non-negotiable rules (Respin) — the ones this phase touches

- **5. No leakage.** Nothing crosses profiles or workspaces; **library contributions are mechanism-level only** (REQ-A03/D04, R-9).
- **6. No invented specifics, no guarantees.** `[check]` placeholders; every output names its weakest point (REQ-I03/I04).
- **4. Learning is earned.** A framework's `confidence` must reflect its actual evidence, not borrow authority from numbers the product will not show.

### The binding decision

**R-29 (`docs/initial/decisions.md`, 2026-08-19):** the shared library seeds from **mechanism-level content only** — F1-F9 generalised to name, beats, why-it-converts, applicability, and tested caveats. **Vivian's voice, her log, her personal specifics, and her performance numbers never enter the product** — not in the seed, not in a framework's evidence entries, not in a prompt bundle. Seeded rows carry `visibility='shared'`, `owner_profile_id=NULL`, and a `curator_status` set by a named curator; **the seed does not self-approve.**

### Lessons that touch this ground

- **2026-07-30 — fix the class, not the field.** A per-field blocklist is the version of this rule that already failed. The guard must refuse the *class* of personal-specific content, and be proven generatively where it can be.
- **2026-07-30 — a comment claiming a property is not the property.** "Mechanism-level only" in a comment is worth nothing; assert it.
- **2026-08-18 — never report a thing recorded until you have re-read the file.**

### Stack and boundaries

- `app/` imports `packages/`, never the reverse. The seeder lives in `packages/brain`, behind the same facade.
- Seed data is a **checked-in JSON file**, reviewable as text, validated by Zod on load.
- Config not code (B5) for any threshold.

### Available specialist agents

`respin-engineer`. Reviewers: `respin-tenancy-reviewer`, `respin-compliance-reviewer`, `respin-learning-reviewer`, `code-reviewer`.
**Do NOT request** any agent not present in `.claude/agents/`.

---

## Requirements Checklist (functional)

| # | Requirement | Source |
|---|---|---|
| F1 | `frameworks` rows carry name, slug, beats, why-it-converts, applicability, confidence, saturation, visibility, `owner_profile_id`, `curator_status`, version | REQ-D01, tech-spec §2:67 |
| F2 | Nine seeded frameworks (F1-F9), mechanism-level only | R-29, build-plan M2 |
| F3 | Seeded rows are `visibility='shared'`, `owner_profile_id=NULL`, `workspace_id=NULL` | R-29 |
| F4 | `curator_status` is set by a **named** curator; a framework is not recommendable until approved | REQ-D02, R-29 |
| F5 | The seeder is **idempotent** — re-running does not duplicate or silently overwrite curator decisions | operational necessity |
| F6 | Saturated frameworks warn; retired ones are not recommended (the *data shape* — the recommender is M3/M4) | REQ-D02 |
| F7 | A framework's `confidence` is **derived from its recorded `evidence_entries`**, with zero entries meaning the honest floor — never a hand-typed value | R-29 consequence 3; REQ-D01's "source references, evidence entries" |

## Requirements Checklist (technical)

| # | Non-negotiable | How satisfied |
|---|---|---|
| T1 | Mechanism-level only (REQ-D04, R-9, R-29) | AC-3's tripwire, proven red against **four** planted violation classes, with the residual stated |
| T5 | `frameworks` has a **sole writer** | AC-10's enumeration — not prose. The repo's own precedent (`schema.ts:90`) says an unenforced sole-writer line "is a forward reference, not a claimed property" |
| T2 | No creator data reaches the library | seeded rows have `owner_profile_id=NULL`; no code path in M2 writes a framework from a creator session |
| T3 | No invented specifics (REQ-I03) | **The seed contains no unverified specifics at all** — an entry that would need a `[check]` is not ready to seed. `[check]` is REQ-I03's placeholder for **the creator to fill**; a shared framework row has no creator, so a seeded `[check]` would ship to every library user forever. Causal-claim check per AC-8 |
| T4 | Nothing self-approves | seeder writes `curator_status='proposed'` unless an explicit named-curator approval record is supplied |

## Edge Cases & Failure Paths

**Inverse events.**

| Event | Inverse | Behaviour |
|---|---|---|
| Framework seeded | Framework retired | `saturation='retired'` — a status change, never a delete. History preserved. |
| Framework proposed | Framework rejected | `curator_status='rejected'`; row stays, is never recommendable. |
| Seed run | Seed re-run | Idempotent by slug: existing rows are left alone, **including their curator decisions**. A re-run never resets an approval or a rejection. |

**Double failure.**

| First | Second | Behaviour |
|---|---|---|
| Seed file fails Zod validation | Operator re-runs | Seeder refuses the **whole file** atomically — a partially seeded library is worse than none, because the missing rows are invisible. |
| A row passes Zod but trips the personal-specifics tripwire | — | The tripwire is a **test**, not a runtime filter: it fails the build, so the violating seed never ships. A runtime filter would silently strip and let a bad seed look fine. |
| Curator approval record names a curator who does not exist | — | Refused; `curator_status` stays `proposed`. An unattributable approval is not an approval (REQ-D02's "named curator"). |

**Degraded mode.** No external boundary is crossed. If the seed file is absent or invalid, the library is **empty** — and an empty library is the honest degraded state: M3's assembler must handle "no matching framework" anyway, and inventing a fallback framework here would be an invented specific.

## Failure Modes & Degraded Behavior

| Boundary | Failure | Degraded behavior | Reconciliation | Spec |
|---|---|---|---|---|
| Seeder -> seed JSON | File missing / invalid | Atomic refusal; library stays empty; loud error naming the failing entry | Operator fixes the file and re-runs | AC-5 |
| Seeder -> Postgres | Tx aborts mid-seed | Nothing lands; no partial library | Re-run (idempotent) | AC-4 |
| Consumer -> library | No framework matches | Consumer reports "no matching framework", never a fabricated one | — | AC-8 (data-shape assertion; consumer is M3) |

## Handoff Contracts

Consumed by M3 (assembly) and M6 (curation queue) — pinned so those phases can cite it:

    export type Saturation = "observed" | "emerging" | "established" | "saturated" | "retired";
    export type CuratorStatus = "proposed" | "approved" | "rejected";
    export type Visibility = "shared" | "private";

    export type FrameworkSeedEntry = {
      slug: string;
      name: string;
      beats: { label: string; purpose: string }[];
      whyItConverts: string;        // MECHANISM claim; no effect size, no guarantee verbs
      applicability: { niches: string[]; goalTypes: string[] };
      // REQ-D01 requires source references and evidence entries, and round 1
      // omitted both — leaving nine hand-typed confidence values with nothing to
      // derive them from, which is the "borrowing authority from numbers the
      // product will not show" that R-29 forbids.
      sourceReferences: string[];
      evidenceEntries: { claim: string; basis: string; verifiedBy: string }[];
      // NOT in the seed file. Computed AT LOAD from evidenceEntries by a stated
      // rule, so a hand-typed value cannot outrun its evidence. Round 2 kept it
      // as a JSON field with a comment claiming it was derived — which is the
      // "a comment claiming a property is not the property" lesson.
      testedCaveats: string[];      // REQ-I04's "names its weakest point", at framework level
      saturation: Saturation;
    };

    // Seeded rows are ALWAYS visibility='shared', ownerProfileId=null,
    // curatorStatus='proposed' unless a named-curator approval is supplied.
    export function seedFrameworkLibrary(db: DbLike, opts?: {
      approvedBy?: string;          // a named curator (REQ-D02)
    }): Promise<{ inserted: number; skipped: number }>;

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| 1 | Write the **tripwire test first** and prove it red against a planted personal-specific seed entry | `respin-engineer` | `respin/packages/brain/tests/library-seed.test.ts` |
| 2 | `frameworks-f1-f9.json` — the nine mechanism-level entries, reviewable as text | `respin-engineer` | `respin/packages/brain/src/data/frameworks-f1-f9.json` |
| 3 | Zod schema for `FrameworkSeedEntry`, `.strict()` (an unknown key is a drifted document) | `respin-engineer` | `respin/packages/brain/src/library-seed.ts` |
| 4 | Idempotent seeder keyed by slug, atomic, never resetting a curator decision | `respin-engineer` | `respin/packages/brain/src/library-seed.ts` |
| 5 | Named-curator approval path; refusal when the curator is unattributable | `respin-engineer` | `respin/packages/brain/src/library-seed.ts` |
| 6 | **Causal-claim check over EVERY free-text seed field** — `name`, `whyItConverts`, `beats[].purpose`, `testedCaveats`, `applicability` — proven against **four** planted shapes, not one | `respin-engineer` | `respin/packages/brain/tests/library-seed.test.ts` |
| 6b | Confidence **derived** from `evidenceEntries`; a row claiming more than its evidence supports is refused | `respin-engineer` | `respin/packages/brain/src/library-seed.ts` |
| 6c | **Sole-writer enumeration** for `frameworks`: assert `library-seed.ts` is the only writer, red against a planted writer in `packages/brain` and in `app/**` | `respin-engineer` | `respin/packages/brain/tests/library-seed.test.ts` |
| 7 | A **prod-safe, idempotent `db:seed-library` CLI** with its own named-curator input, separate from `seedDb` and **never exported from the facade** | `respin-engineer` | `respin/packages/brain/src/library-seed-cli.ts`, `respin/package.json` |
| 8 | Re-read `decisions.md` R-29 and confirm the shipped seed matches its stated boundary | `respin-engineer` | `docs/initial/decisions.md` (read), ledger entry |

## Files to Create / Modify

| Path | New/Modified | Notes |
|---|---|---|
| `respin/packages/brain/src/library-seed.ts` | New | Schema, seeder, curator path |
| `respin/packages/brain/src/data/frameworks-f1-f9.json` | New | **The reviewable boundary artifact** |
| `respin/packages/brain/tests/library-seed.test.ts` | New | Tripwire, idempotency, forbidden verbs |
| `respin/packages/db/src/seed.ts` | Modified | Call the seeder behind `assertSeedAllowed` |
| `respin/packages/brain/src/{index,app-server}.ts` | Modified | Export the sanctioned surface |

## Migration Steps

None — `frameworks` landed in phase 1's migration `0011_*`. Seeding is data, not schema.

## Verification Steps

1. **State: phase 1 complete and green.**
2. **State: after task 1, before task 2.** Run the tripwire against a **planted** seed entry containing a personal specific (a named person, a follower count, a first-person voice rule) -> **red**. Record the output. *(A tripwire that has never fired is the `retention.test.ts` finding all over again: the regex caught one shape and missed three.)*
3. **State: after task 2.** `pnpm -C respin test -- library-seed` -> tripwire green against the real seed file.
4. **State: after step 3.** Widen the tripwire's own coverage check: plant **four** distinct violation shapes (a proper name, a numeric performance claim, a first-person voice rule, a niche-identifying specific) and confirm each is caught. *(This is the 2026-07-30 lesson: fix the class, not the instance.)*
5. **State: after task 4.** Run the seeder twice against the same database -> second run reports `inserted: 0`, and a curator decision set between runs is **unchanged** (AC-4).
6. **State: after task 6.** Forbidden-verb check red against a planted `"this framework guarantees a 3x lift"`.
7. **State: after task 7.** `pnpm -C respin db:seed` on a fresh database -> nine shared frameworks, all `owner_profile_id` NULL, all `curator_status='proposed'`.
8. **State: after step 7.** Full entry gate including the CI-shape run.

## Acceptance Criteria (verifiable PASS/FAIL)

| # | Criterion | Evidence |
|---|---|---|
| AC-1 | Exactly nine frameworks seed, each with all REQ-D01 fields populated | test `the seed carries all nine F1-F9 frameworks, fully populated` |
| AC-2 | Every seeded row is `visibility='shared'`, `owner_profile_id=NULL` | test `seeded rows belong to no creator` |
| AC-3 | **No seeded row carries personal-specific content** — proven against **four** distinct violation shapes, each shown red | test `the seed is mechanism-level only (R-29)`; verification steps 2 and 4 |
| AC-4 | The seeder is idempotent and **never resets a curator decision** | test `re-seeding preserves curator decisions` |
| AC-5 | An invalid seed file is refused **atomically** — no partial library | test `a bad entry refuses the whole file` |
| AC-6 | Seeded rows are `curator_status='proposed'`; nothing self-approves | test `the seed does not approve itself` |
| AC-7 | An approval naming an unattributable curator is refused | test `an unattributable approval is not an approval` |
| AC-8 | **Every free-text seed field** states a mechanism, not a causal or guarantee claim — checked across all of them, proven red against four planted shapes (a named verb, a numeric claim like "3x more likely to convert", an inevitability like "works every time", a second-person promise like "you'll see") | `library-seed.test.ts`. **The residual is stated, not claimed closed:** a mechanism claim and a causal claim differ in epistemic force, not vocabulary, so no scan closes this class — the backstop is the same named human read as AC-3, recorded. *Round 1 gave AC-3 four shapes and an honest concession and gave this sibling one example and a flat PASS/FAIL, when causal-claim detection is the harder of the two* |
| AC-10 | **`library-seed.ts` is the only writer to `frameworks`**, enumerated **repo-wide with default-deny** — not scoped to two directories. Round 2's scan covered `packages/brain` and `app/**`, leaving `packages/db/src/seed.ts` (which phase 4 itself modifies) and any future `packages/trends` outside it | enumeration, red against planted writers in `packages/db` and `packages/brain` |
| AC-14 | **The seeder is CLI-only and never facade-exported.** `seedFrameworkLibrary` takes an unscoped `DbLike` and writes the shared library; on `@respin/brain/app-server` any server action could rewrite it | facade scan, red against a planted re-export |
| AC-11 | **`confidence` is absent from the seed file and computed at load** from a stated rule over `evidenceEntries`; zero entries yields the floor | test, red against a seed entry carrying a literal `confidence`, and red against a planted rule that ignores the entries. *Each `evidenceEntry` carries `{claim, basis, verifiedBy}` and no n/population/period — so the rule's ceiling is deliberately low, and that limit is stated rather than dressed up* |
| AC-12 | The curated library reaches production **without** running the dev seeder | `db:seed-library` runs against a non-local host and inserts no dev user; `assertSeedAllowed`'s `RESPIN_SEED_FORCE` path is not on this route |
| AC-13 | No seeded field contains a `[check]` marker | test — a shared row has no creator to fill it |
| AC-9 | **R-29 re-read after implementation**, and the shipped seed matches its stated boundary | ledger entry naming the re-read (2026-08-18 lesson) |

## Least confident (one line)

**That neither "personal-specific" nor "causal claim" is fully detectable by a scan** — a proper name or a follower count is greppable and a named verb is greppable, but "the founder of a Melbourne agency" and "reliably produces" are judgment calls, so AC-3's and AC-8's four shapes each bound their class only as far as a source scan reaches; for both, the residual is a **named human read of a nine-entry JSON file, recorded in the ledger**, and this plan says so rather than claiming either tripwire is complete — round 1 made that concession for one of the two and quietly overclaimed the harder one.

## Out of Scope (Surgical Changes)

Do not build the M6 curation-queue UI (DL-3). Do not build framework *retrieval* or matching — that is M3's assembler and M4's autopsy. Do not create a path that writes a framework from a creator session (M4+, and it arrives with its own gate — **DL-8 records that these seed guards become load-time validators when that second writer exists**, because a test-time guard protects nothing on a path that did not exist when the test was written). Do not touch `packages/credits/**`, `src/`, or `cutdown/`.

## Completion Criteria (Definition of Done)

- Entry gate clean including the CI-shape run.
- Applicable Critical-Path gates PASS: **brain tenancy** (R-9/REQ-D04 mechanism-level only), **spin compliance** (REQ-I03, forbidden verbs), **learning honesty** (confidence reflects real evidence).
- `decisions.md` R-29 re-read and confirmed consistent with what shipped; `PRD.md` Open Decision 3 already marked resolved.
- AC-1 .. AC-14 met with named evidence, and both human-read residuals (AC-3, AC-8) recorded with the reader named.
- **R-9's founding-creator confirmation named in the ledger.** R-29 records the *owner's* decision on the boundary and is stricter than R-9 asked for, but R-9's wording is "written confirmation with the founding creator". If owner and founding creator are the same party, say so; if not, name who confirmed.
