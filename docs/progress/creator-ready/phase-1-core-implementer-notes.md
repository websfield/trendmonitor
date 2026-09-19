# Phase 1 core implementer notes

Scope: T1 and T3. T8 was released before any T8 source or test change.

## Decisions implemented

- `AssemblyError.kind` is the closed 16-kind vocabulary. The three prompt-assembly kinds are also exported as `ASSEMBLY_KINDS_PRE_VENDOR`.
- Quote matching keeps exact matching first. Canonical fallback uses only the pinned quote, dash, and whitespace folds; keeps paragraph breaks distinct; maps canonical UTF-16 offsets back to the original post; rejects invalid or surrogate-splitting ranges; and stores the original post slice.
- The mapper override remains a test seam. A TypeScript AST scan permits only the unchanged `mapBack` forwarding inside `parseVoiceReply`, verifies the real `inferVoice` caller omits it, and fails closed on spread or unresolvable object keys.
- Refusal state and safe logs carry `assemblyKind` only for `instanceof AssemblyError`. Pre-vendor kinds replace the counted detail; post-vendor kinds render beneath it. The shared usage pointer is a static string literal.
- Onboarding progress is derived from the existing own-post page, voice history, submitted interview draft, and a new scoped `generationsNewest({ limit: 1 })` composition. Only `WorkspaceAccessError` and `ProfileAccessError` degrade a step to `unknown`; unexpected errors rethrow.
- The posts step becomes `unknown` when its minimum is unavailable/non-finite, when the page is outside the paste step, or when the 26-row read is clamped below a larger minimum.
- Panels render in the pinned order. Admired posts and the candidate reference check are collapsed with `<details>`; the duplicate posts-panel `PlanLine` was removed.

## Files changed for T1/T3

- `respin/packages/llm/src/assemble.ts`
- `respin/packages/llm/src/index.ts`
- `respin/packages/llm/tests/assemble-kinds.test.ts`
- `respin/packages/credits/src/app-server.ts`
- `respin/packages/credits/tests/voice-build-tolerance.test.ts`
- `respin/packages/db/src/with-workspace.ts`
- `respin/packages/db/src/app-server.ts`
- `respin/packages/db/src/index.ts`
- `respin/packages/db/tests/profile-scope.test.ts`
- `respin/app/(product)/billing-errors.ts`
- `respin/app/(product)/onboarding/actions.ts`
- `respin/app/(product)/onboarding/run-state.ts`
- `respin/app/(product)/onboarding/run-copy.ts`
- `respin/app/(product)/onboarding/run-outcome.tsx`
- `respin/app/(product)/onboarding/page.tsx`
- `respin/app/(product)/onboarding/onboarding-view.tsx`
- `respin/tests/onboarding-ui.test.tsx`
- `respin/tests/onboarding-refusal-log.test.ts`
- `respin/tests/selected-profile-pages.test.tsx`
- `respin/tests/first-login-pages.test.tsx`
- `respin/tests/profile-cage.test.ts`
- `docs/progress/creator-ready/phase-1-mutations-core.txt`
- `docs/progress/creator-ready/phase-1-core-implementer-notes.md`

The presentation builder owns `respin/tests/page-wiring.test.tsx`; the required registration passed to that owner was `hasGenerationForProfile: vi.fn()`, facade forwarding as `hasGenerationForProfile: mocks.hasGenerationForProfile`, with a default `mockResolvedValue(false)`.

## Validation

All commands below used process `TEMP` and `TMP` set to `C:\projects\ai.playground\trendMonitor\.codex-tmp` where Vitest or TypeScript ran.

- `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts tests/import-boundary.test.ts` — PASS, 188/188. Covers AC1, AC2, mapper containment, independent exhaustive Unicode oracle, generated `parseVoiceReply` evidence, generated mutation negatives, and the async child-process boundary.
- `pnpm -C respin exec vitest run tests/onboarding-ui.test.tsx packages/credits/tests/isolation.test.ts packages/llm/tests/assemble-kinds.test.ts` — PASS, 301/301. Covers AC1-AC3 copy/render witnesses, facade inventory, and canonical mapper tests.
- `pnpm -C respin exec vitest run packages/db/tests/profile-scope.test.ts` — PASS, 49/49. Covers AC6 mine/sibling/attempt-only/foreign/P4 witnesses.
- `pnpm -C respin exec vitest run tests/profile-cage.test.ts tests/client-bundle-boundary.test.ts tests/import-boundary.test.ts tests/first-login-pages.test.tsx tests/selected-profile-pages.test.tsx tests/onboarding-refusal-log.test.ts packages/credits/tests/voice-build-tolerance.test.ts` — first run had 193 passing and one failure because the new mapper test used `execFileSync`; replaced with awaited `execFile`. The failed import-boundary suite then passed 120/120 in the 188-test rerun above. All other suites in this command passed: profile cage 43/43, client bundle 5/5, first-login 6/6, selected-profile 17/17, refusal log 2/2, and PGlite tolerance 1/1.
- `pnpm -C respin typecheck` — PASS for root and all eight recursive package checks.
- Narrow ESLint over all T1/T3 owned source and test files — PASS with no findings.
- `git diff --check` — PASS after the presentation owner removed the one routed trailing-whitespace finding; remaining output is line-ending warnings only.

- AC12 core mutations: PASS. All twelve required real-target plants (w1; two
  w1b plants; w2; w2b; predicate-call and bounds-guard w2e plants; w5a/w5b/w5c;
  w8; w8b) reddened their intended assertions, their named controls passed,
  every same-command restore run passed, and every target's final SHA-256 was
  byte-identical to its starting SHA-256. Exact commands, exits, failures,
  controls, and hashes are recorded in
  `docs/progress/creator-ready/phase-1-mutations-core.txt`.

## Batch 0 specialist repairs

- **BILL-P1-001:** the money-honesty scan drove shared `SPEND_ONLY` copy but
  never rendered the three pre-vendor assembly branches, whose kind copy
  replaces the shared detail. It now renders all three states and requires each
  rendered result to state what happened to credits; the existing omission
  witness remains.
- **BILL-P1-002:** the preservation test checked only the two declaration names.
  It now parses both initializers with the TypeScript AST and independently pins
  the complete closed code list plus every override title/detail. It also checks
  the exported runtime list against the same independent literal.
- **P1-TEN-01:** the two end-extension predicate rows were duplicates, the split
  case did not have canonical equality, and the injected table lacked edge and
  surrogate cases. The predicate and injected tables now have distinct
  non-whitespace/whitespace extensions and canonically equal start/end
  split-surrogate literals, with exact-miss and canonical preconditions.
- **P1-TEN-02:** containment resolved named imports and compared only the text
  `mapBack`. It now resolves namespace member calls, requires the forwarding
  call's nearest function to be the real `parseVoiceReply`, and verifies its
  sole `mapBack` binding is the unchanged plain `const` destructure from
  `params`, with no default or rest initializer. Namespace override, defaulted
  and writable destructure, and local replacement-binding plants prove those
  closures.
- **P1-TEN-03:** `progressRead` discarded listed scoped errors after logging and
  left only `{ known: false }`. It now carries `billingErrorDisplay(err)` into
  the affected progress step; the view keeps state `unknown` and renders that
  existing safe title/remedy in a named alert. Both listed classes are driven
  through the real page, while the existing `TypeError` rethrow remains green.

Batch 0 test-first evidence and validation:

- Red stage: `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts tests/onboarding-ui.test.tsx tests/selected-profile-pages.test.tsx` exited 1 with exactly four intended failures: namespace override accepted, replacement local binding accepted, and missing rendered remedies for each listed scoped-error class. The new money/initializer and offset-table tests passed against existing behavior.
- Parent-inspection red stage: `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts -t "mapper containment"` exited 1 because the new defaulted and writable destructure plants were accepted. After the plain-`const` repair, all 11 selected mapper-containment controls passed.
- Final green focused set: `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts tests/onboarding-ui.test.tsx tests/selected-profile-pages.test.tsx tests/onboarding-refusal-log.test.ts packages/credits/tests/voice-build-tolerance.test.ts tests/import-boundary.test.ts` passed 421/421.
- An earlier post-type-fix assembler rerun passed 75/75; the final focused set above includes the complete expanded 77-test assembler suite.
- `pnpm -C respin --filter @respin/llm typecheck` passed. Narrow ESLint over the five Batch 0 touched source/test files passed with no findings.
- Final `git diff --check` over the seven owned repair/evidence files passed; only the repository's line-ending conversion warnings were emitted.
- The first full `pnpm -C respin typecheck` found the scanner return annotation and was fixed. A later root `tsc --noEmit` passed. The latest recursive typecheck attempt stopped on the concurrently edited presentation-owned `tests/page-wiring.test.tsx:131` missing `initialStatePropDeclarations`; that integration error was reported to the orchestrator and this implementer did not edit the file.
- Strengthened real-target w2b, predicate-call w2e, and bounds-guard w2e plants all exited 1 on the intended new cases, restored green, and returned `assemble.ts` to its exact starting SHA-256. The appended transcript records commands, controls, exits, and hashes.

## Outstanding work

- The canonical full gate was deliberately not run; the orchestrator schedules it after integration.
- No environment-backed or deployment check ran because required live variables are absent and environment files are prohibited.
- Presentation-owned T6/T7 mutations remain outside this implementer's scope.

## Weakest bet

The containment scanner is the weakest bet: it closes named, aliased, namespace,
spread, computed-key, nested-function, and replacement-binding forms, but a
future production wrapper that hides the mapper behind a newly introduced API
would require the tracked call graph and its planted controls to expand.

## Batch 1 TEN-02 repair brief — 2026-09-18

Independent batch1 resolved TEN-01/03 and BILL001/002; TEN-02 remains partial (Medium). Invariant: the only production supplied mapper is unchanged params.mapBack forwarded directly inside parseVoiceReply. Root cause: the scanner recognizes only direct identifier/member calls and verifies the const binding without restricting earlier uses of the source parameter. Population: tracked Respin TS/TSX, imported seam references and parseVoiceReply parameter uses; discovery remains the existing git ls-files scanner, with explicit llm-test injection exemption.

Actual held-out reproducer: the scanner returns [] on parenthesized namespace calls, static template-literal namespace members, params reassignment and params.mapBack mutation before the approved destructure. Direct namespace/local replacement/removal controls reject. Reviewer agrees with the bounded correction: unwrap static wrappers/member forms or reject unsupported references, and permit no params body use except the approved plain const destructure. No production override was found. This diagnostic agreement is not a revised-code verdict.

Assigned repair: only packages/llm/tests/assemble-kinds.test.ts plus these notes. Add regression witnesses first, observe red; implement the class repair with unchanged-positive controls; cover sibling wrapper/static-member and parameter-mutation/escape forms, keeping scope bounded and no new dependency. Preserve every existing assertion and exact runtime source bytes. Run focused mapper containment, complete assembler suite, llm typecheck and owned ESLint. Parent owns integrated checks and a fresh independent batch2 reviewer. No source/runtime/schema/credit changes and no independent closure claim from builder results.

## Batch 1 TEN-02 scanner repair results - 2026-09-18

- Initial plant-only red: `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts -t "mapper containment"` exited 1 with 14 intended failures, 11 existing controls passing and 66 skipped. The failures covered parenthesized and static-template calls, a dynamic namespace member, imported-function and namespace-member escapes, wrapped `locateQuote`, and reassignment/mutation/computed mutation/alias/direct escape/closure escape of `params`.
- Exact-forwarding red: `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts -t "forwarding.* plant"` exited 1 with all four plants failing and 91 skipped. The scanner had accepted a wrapped forwarding call, changed content/quote arguments and an extra fourth argument. After requiring the literal three-argument `locateQuote(content, v.quote, mapBack)` AST form, the same four plants passed.
- Namespace-object red: `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts -t "namespace object"` exited 1 with all three namespace-object alias/destructure/argument escapes failing and 98 skipped. After restricting the `@respin/llm` namespace identifier to static member ownership, those three plus the `as`, non-null and `satisfies` wrapper controls passed 6/6. A separate relative-import namespace alias plant exited 1 before relative modules rooted in `packages/llm` joined that closed population, then passed 1/1 after the repair.
- Final focused green: `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts -t "mapper containment"` passed 36/36 selected tests with 66 skipped.
- Final complete-file green: `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts` passed 102/102.
- `pnpm -C respin --filter @respin/llm typecheck` passed; `pnpm -C respin exec eslint packages/llm/tests/assemble-kinds.test.ts` passed with no findings.

Weakest residual: the scanner is deliberately syntax- and import-population-based rather than a general symbol/dataflow engine. Named seam imports and direct static namespace members are closed regardless of module spelling; whole-namespace escape detection enumerates `@respin/llm` (including subpaths) and relative imports rooted in `packages/llm`. If a future package re-exports the seam and callers import that package as a namespace before aliasing the whole object, that new import surface must be added to this population and its plants. No independent reviewer verdict is claimed here.

## Independent batch2 outcome — parent handoff

TEN02 remains PARTIAL/Medium: the scanner accepts a getter on the direct argument object that installs mapBack via Object.defineProperty(this, ...). The actual caller plant passes TypeScript and ESLint, and actual assembler execution invokes the mapper. This is a current test-guard assurance gap, not merely the future re-export population risk noted above. No production override exists. Full evidence: phase-1-batch2-tenancy.md. Earlier four bypasses reject; all parent checks pass. Bounded diagnosis plus repair did not converge, so gate-rules §5 stops revisions. Do not treat these construction notes as independent closure or start another repair cycle from them.

## Owner-authorized batch4 binding repair — 2026-09-18

Owner answered “sure” to the bounded TEN02 repair and final batch4 re-review. Batch3 had verified accessor/prototype repair, but demonstrated a block-local function named mapBack accepted by the unchanged-forwarding scanner (phase-1-batch3-tenancy.md). No runtime override existed.

Invariant: the literal forwarding call must use the unchanged const binding derived from params.mapBack. Cause: collect returned before visiting a function declaration's name, conflating the name's enclosing scope with the body's separate scope. Population: identifier-named variable/binding/parameter declarations plus runtime function/class/enum declarations within parseVoiceReply's inspected body; nested function bodies remain excluded. Declaration-name checks run before that exclusion. Existing direct-call/enclosing-function guards remain unchanged. No dataflow or arbitrary-global-mutation guarantee is added.

Added exact original block-function plant (void mapBack after the destructure, function before the real forwarding call), hoisted-after-call, async/generator, class and enum siblings; positive control includes unrelated nested parameter and method names. `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts -t 'mapper shadow plant|unrelated nested mapper'` before the repair: exit1, six intended failures, one positive control passed,108 skipped. Transcript phase-1-batch4-shadow-red.txt. Scanner now collects enclosing-scope declaration names before skipping function bodies. `pnpm -C respin exec vitest run packages/llm/tests/assemble-kinds.test.ts` after repair: exit0,115/115 tests,102.45 seconds (phase-1-batch4-focused.txt). Integrated seven-command gate passed:5260 tests passed/101 Docker skipped,212 files passed/23 skipped; typecheck/lint/build/preflight/worker:typecheck/db:check all exit0 (entry-gate-phase-1-batch4.txt). Independent closure pending. Only assemble-kinds.test.ts changed against batch3; other47 assessed files match. No assertions removed/weakened and no runtime parser/money edit; tail diff check not triggered.

Weakest bet: outer-scope declaration names must be counted while unrelated function-local names remain outside the forwarding scope. Independent reviewer must challenge a held-out declaration/binding shape against the actual scanner and installed compiler.

Independent batch4 tenancy completed PASS/A with zero findings. Original block-function plus held-out overloaded/escaped/destructuring shadows reject; unrelated nested declaration/expression/method/getter bindings remain accepted. Actual compiler/lint/runtime probes discriminate,49 selected mapper tests pass, all48 hashes stable. Full report phase-1-batch4-tenancy.md. Final generalist consolidation pending; live Verification3 and bad_shape remain outstanding.

Final batch4 consolidation completed local PASS/A; all10 original findings closed. Whole Phase1 Not yet solely on incomplete live acceptance, with bad_shape unresolved. See phase-1-batch4-generalist.md. No runtime change or Phase2 entry.
