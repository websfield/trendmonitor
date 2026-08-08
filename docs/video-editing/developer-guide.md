# Cutdown — Developer Guide

**Who this is for:** the developer building Cutdown Phase 0 without day-to-day owner oversight. Read order: `PRD.md` → `tech-spec.md` → `decisions.md` → this file. The tech-spec §15 build sequence is your work plan; the phase plans under `docs/plans/cutdown-*` (if present) break it into gated phases.

**The one-sentence contract:** everything you need to decide is either decided (`decisions.md`), decidable by you under the escalation protocol below, or explicitly the owner's — and the owner-owned list is short.

---

## 1. Toolchain (pinned)

All pinned in `cutdown/.tool-versions` + `package.json` `engines` at first commit. `pnpm-lock.yaml` and `uv.lock` are committed and frozen with them; generated TypeScript/Python contract types are also committed, never gitignored. Decision rule: latest LTS at time of first commit, then **frozen** until a recorded bump (append the bump to `decisions.md`).

| Tool | Version | Notes |
|---|---|---|
| Node | 22 LTS | |
| pnpm | 9.x | Workspace root is `cutdown/` — **never** the repo root (tech-spec §2). Run everything as `pnpm -C cutdown ...`. |
| TypeScript | 5.x (latest at first commit) | |
| Python | 3.12 | Via **uv**; `cutdown/pyproject.toml` is its own uv workspace, independent of the repo-root one. |
| FFmpeg | 7.x **full** build | On Windows: gyan.dev "full" — it includes libass, which the Phase 0 caption path requires. `cutdown ingest` preflight asserts the `subtitles` filter is present and fails fast if not. |
| Turborepo | **not used** | Revisit per D-23. |

**Windows is the primary dev machine.** The entrypoint contract is argv-array spawning for exactly this reason (tech-spec §6.2) — if you find yourself writing a `.cmd` shim or relying on a shebang, you're off-contract.

## 2. Environment & secrets

- Model API keys live in `cutdown/.env` (gitignored by the repo's existing `*.env` rules). Read only by the CLI process; never passed to render or worker subprocesses that don't need them; never committed, never logged (golden rule 2).
- Anthropic is the Phase 0 provider (D-21). The owner sets the spend ceiling **before build step 5**; if it's unset when you get there, that's an escalation trigger, not a guess.
- `project-data/` holds client footage — treat it as rights-sensitive. It never leaves the machine except as minimized model inputs (selective keyframes, transcripts) per PRD §10.7.

## 3. Prerequisites owed by the owner

Track these from day one; each has a decision-record entry:

1. **2–3 real Social Soup source files + completed rights records** (REQ-003 fields per file) — needed before step 2 can be verified on real footage (D-27). Interim: self-shot/CC0 placeholders; **Phase 0 exit cannot be claimed on placeholders.**
2. **The 3-account/client list with stable `accountId` values** for step 10 (D-27/D-36); display-name changes never create a new account in status reporting.
3. **Phase 0 model-spend ceiling** before step 5 (D-21).
4. **Style-profile inputs** for 2–3 clients — brand colours, fonts, prohibitions, tone (D-26); a 30-minute questionnaire per client, not a workshop.

Ask for all four in the first status update, not when each blocks you.

## 4. Working agreements

- **Branching:** work on a `cutdown/phase-<n>` branch (e.g. `cutdown/phase-0`); merge to `main` when the phase's gates are green. Commit at least at every completed build-sequence step. Never commit `project-data/`, `.env`, or fonts/media you don't have rights records for.
- **Review:** self-merged after gates pass; the owner reviews async after the fact. Anything on the escalation list waits — everything else ships and gets reviewed later.
- **Gates (Cutdown's Definition of Done):** a change is done when `cutdown build:contracts --check` + `cutdown validate:contracts` + `cutdown test:skills` pass, plus the step's own *Done when* criterion (tech-spec §15). **Cutdown-only changes are exempt from the parent repo's UGC Intelligence entry gate** (`dotnet build/test`, root `pytest`, frontend checks) — tech-spec §14. If a change touches both `cutdown/` and anything outside it, both gates apply — and that combination should make you suspicious of the change.
- **Contract changes:** semantic schema change = new major-version file + changelog entry + regenerated, committed types in the same commit (tech-spec §3). Every package records its complete schema ID/version/hash set (D-36); the Phase 0 exit criterion "last 10 outputs need no breaking contract change" is evaluated from the last ten approved real packages and the immutable contract-change timeline — burn breaking changes early, not late.
- **QA waivers:** only warnings are waivable, by a named human with a reason and finding IDs. D-35's blockers are never waivable. A package with warning waivers remains visible as `pass_with_waivers` in status output.
- **Status:** a short written update (what shipped, what's next, open escalations, `cutdown status --phase0` output once it exists) at every completed step — async, no meeting.

## 5. Escalation protocol (the rule that replaces oversight)

When a question is not answered by the PRD, tech-spec, or `decisions.md`:

> **Pick the most reversible default, record it as a new row in `decisions.md` (date, question, default chosen, revisit trigger), and keep moving.**
>
> **Only these wait for the owner:** a decision that (a) spends money beyond the agreed ceiling or opens a new paid account, (b) accepts a license obligation (Remotion company license, gated model licenses, non-OFL fonts), (c) sends client footage or data to a provider not already in `decisions.md`, or (d) puts anything in front of an external party (naming, publishing, client-visible output beyond the agreed accounts).

Owner-owned items already known: D-2 (added music), D-10 (external naming), D-16 (Remotion install), D-17's hosted-ASR fallback, D-21 (spend ceiling / new providers), D-27 (footage, rights, accounts). Everything else in this project is yours to decide and log.

When an escalation fires: write it as a dated entry in your status update with your recommended answer and what's blocked vs. what you're continuing in parallel. Never idle on a single blocker — the build sequence has enough independent tracks (schemas, fixtures, QA rulesets, the runner) that something is always unblocked.

## 6. What "done" means for Phase 0

Use the two milestone names from D-38 without abbreviation: `PIPELINE_IMPLEMENTATION_COMPLETE` is the developer handoff milestone; `PHASE_0_EXIT_EARNED` is the real-footage product gate. Never report the former as “Phase 0 complete.”

All four PRD §15 Phase 0 exit criteria, computed by `cutdown status --phase0`, green on real footage:

1. ≥ 20 approved real outputs across 3 accounts (approvals via `cutdown approve`, D-9);
2. zero invalid source ranges in final renders (the §12 property test is the mechanism);
3. last 10 outputs required no breaking contract change (schema changelogs are the evidence);
4. rights records + QA reports accompany every delivered package.

Reporting honestly against these — including "not met yet" — is the job. A green claim the artefacts can't back is the one failure mode this doc set can't survive.

## 7. Phase 6 handover addendum (2026-08-02 — facts from the proving run)

`PIPELINE_IMPLEMENTATION_COMPLETE` was earned on 2026-08-02 by the fixture proving run (job `e2e-mixed-1`; full record in `cutdown/docs/proving-run-placeholder.md`, real-footage path `BLOCKED-ON-D-27/D-36` per `proving-run-real.md`). Operational facts a developer or operator should know that the earlier sections don't state:

- **CPU throughput (D-17 status):** on the pinned Windows machine, whole-asset indexing is dominated by OCR (~150 s for a 27 s clip), not ASR — whisper transcribes short clips faster than real time on CPU. The D-17 revisit trigger is not approached at Phase 0 clip lengths.
- **Editorial needs footage with enough Moments.** REQ-036's deterministic floor is `max(3, JobBrief.variantCount × 2)` rankable (embedding-bearing) Moments; a 5 s single-utterance clip yields exactly one. The committed e2e corpus (`data/golden-sets/e2e/`) exists because of this; use `promo-take.mp4` (7 Moments) or richer footage when driving the editorial stages.
- **Captions quote the ASR, not the script.** Quote fidelity binds `displayText ⊆ verbatimSourceText ⊆ Moment.transcript.verbatimText` over the *transcribed* words (whisper heard "tape" where the script said "take"); author recorded fixtures and revision notes from the committed transcript artefact.
- **QA warnings fail the gate unless waived by name** (D-35): `pass` needs zero findings; any unwaived warning reads `fail`; a waiver is scoped to one `planHash`, so the draft and final tiers of the same EDL need separate waivers.
- **Exit codes differ by surface:** `cutdown render` (CLI verb) exits 4 on a QA-gate `fail`; `cutdown skills run render` exits 0 with the verdict in the result JSON. Scripts must read `gateStatus`, not the exit code, on the skills-run surface.
- **Crash recovery is two commands:** a killed index resumes from sub-stage checkpoints (`cutdown index …` again); a killed render leaves an orphan directory the runner's gate refuses fail-closed (`QA_REPORT_UNREADABLE`) — re-run the render, then `cutdown run <job>` advances. Nothing in the run log is ever rewritten.
- **`--audio-events` takes the index artefact directly** since D-51 (source-tick `{audioEvents}` projected onto the output timeline; `{events}` with output-relative ms also accepted).
