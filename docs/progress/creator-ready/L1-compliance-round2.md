# L1 gate — respin-compliance-reviewer, round 2 (the one permitted re-run, 2026-10-03)

Frozen tree: `L1-freeze-r2.sha256`, 41/41 OK before and after; sorted digest `3a85025daeb4`.

**Verdict: BLOCK · Not yet · Grade D.** 1 BLOCK, 1 CHANGE High, 3 CHANGE Medium, 3 Low, 2 Note. Fourth member of the round-1 class.

## Findings

- **BLOCK** `respin/packages/modes/src/mode-checks.ts:1015-1058` (`continue` at :1058; label-selected fields at :987, :1017). With `basis.kind = "material"`, only the excerpt is verified, only against the label-selected field, and the event-shape scan is skipped for every other premise line and every beat. Through real `runKillTest`, 0 findings: B2 (auto, labelled demonstration, real quote on `payoff`, invented win in `whatHappens`); B3 (story script with a valid quote, beat "then I sold the footage to a studio and won an award for it"); B1 (`interest` invents a hire); B1b (story `payoff` "the video went viral and your channel doubled"). `CREATIVE_RULES` promises otherwise. Fix: run `eventShapeIn` over every premise field and every beat whatever the basis kind; under `material` a hit passes only if `excerptRelatesTo(excerpt, thatLine)`; premise relatedness against `whatHappens` and `payoff` both; plant B2, B3.
- **CHANGE High** `mode-checks.ts:1181` (`withMark` appends ` [check]`) with `traceability.ts:576` (`markedAdjacently`) and `app/(product)/studio/run-copy.ts:664-666`. The server mark is indistinguishable from a model `[check]`; traceability treats it as covering the adjacent specific. C4 (solo declared): location "the bakery on Elm Street", equipment "a camera rented for $400", "drone bought in 2019" → usable, 1 call, `hardRules: []`, `traceability: []`, while the heading says every number, date and name was found in the creator's material. Mid-item `$400` (C4c) → `invented_specific` ×3. Revision safe (`stripMarkedSpecifics`). Fix: store the server decision structurally (a server-owned per-item flag rendered as `[check]`), or run `scanTraceability` on the pre-mark draft; plant C4.
- **CHANGE Medium** `hard-rules.ts:172`, `mode-checks.ts:1492-1584`: event-guard false positives unrecorded; refusal remedy "not in your own material" can be false (E3: a beat word-for-word from the creator's input refused as `first-person-past`). Fix: "names no source for it"; exempt a line sharing a 4-word run with `basisCorpus`; narrow bare result verbs to my/your/our subjects; driven false-positive gap; L6 measures the rate.
- **CHANGE Medium** `mode-checks.ts:906,918` (`EVENT_SHAPES`): first-person-past recall misses not recorded ("I quit my job…", "we put the camera down…", "I hit record and the oven caught fire", "I nearly gave up…", "we both cried…", "I’d already filmed it twice", "I set the camera on the shelf…", "me and my sister opened a bakery"). Fix: adverb/quantifier slot, `’d` + participle, base-form pasts, compound subjects; record the rest.
- **CHANGE Medium** `mode-checks.ts:1333-1353`: four round-1 plants refused (closed as instance); "Before & After", "Before/After", "OpenLoop", "Cost Revealed", "The Confessional Arc", "Loop, Open" pass. Fix: drop and/&, compare space-stripped forms, plant, record the rest.
- **Low** `mode-checks.ts:1104`: `unconfirmed-script-beats-unmarked` satisfied by a `[check]` on any beat (E2). Fix: require the mark in a beat sharing ≥2 content words with the premise event.
- **Low** `app/(product)/studio/generation-outcome.tsx:118`: `FILMING_UNCONFIRMED_NOTE` not rendered for a server-marked shot-map line alone.
- **Low** (recorded-claim accuracy) `docs/initial/decisions.md` R-149 item 1: export does not read `presentedFilming` yet; reword as future tense.
- **Note** — helper never marked when `people` undeclared (by design, shown honestly).
- **Note** — kit named in `whatHappens`/beat VO is not marked; consider recording.

## Round-1 findings re-run

BLOCK (label) closed as instance, class open via the material branch. High (undeclared filming) closed as a class for filming fields and kit-shaped shot lines; introduced the High above. Unrelated quote, unconfirmed beats, shot map, custom names: closed as instances with residuals. Prompt specificity: closed.

## Event-guard false-positive cost

Not acceptable as shipped: 9 of 43 honest fixture strings match a shape (three restate the creator's own input); fixture beats were rewritten to avoid the guard; 12 of 20 author-written ordinary opinion lines flagged (indicative, not a rate). Each false positive costs a rewrite; a second hit is a debited honest refusal whose remedy line can be false.

Checks: similarity gate holds; kill-test honesty holds; no invented specifics violated (:1058; :1181 with `run-copy.ts:666`); no guarantees and no concealment hold. Reviewer ran `vitest run packages/modes` (615 passed) and seven `tsx` probes outside the repo; edited nothing.
