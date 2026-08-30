# Respin Finish — progress ledger

Append-only. One line per lifecycle event. Proof of completion is the evidence
on disk under `docs/progress/respin-finish/`, never a row in a plan table.

## Slice 1 — Profile + intake

- 2026-08-27 — started (dependency gate: slice 1 `Depends on: —`, no predecessor to prove)
- 2026-08-27 — entry-gate PASS (baseline, before any edit): CI shape, Docker live, `TEST_DATABASE_URL` set, 41 files / 793 tests / 0 skipped, exit 0 → `entry-gate-baseline.txt`
- 2026-08-27 — least-confident: **the `@respin/db` ↔ `@respin/credits` split of `createProfile`.** The cap decision and the insert are in different packages by necessity (R-30 constraint 2), and the thing I would bet fails first is that some path reaches the insert without the decision — a second caller of `workspaceWriteCapabilities().createProfile`, or an app route that finds a way to the capability. The instruments are `tests/table-writers.test.ts` (one named writer) and the import-boundary deny fixtures; if either is weaker than I think, the per-tier cap is bypassable and nothing goes red.
- 2026-08-27 — browser walk (dev server, port 3005, real Postgres): **"A creator can create a creator profile and paste their own past posts, and see them listed back" — WALKED AND PASSING.** Sign up → `/onboarding` → create "Anna Rivers" → paste 5 posts → 5 listed, newest first, each with its ISO date and character count. Emoji count verified as CODE POINTS against the live page (131 shown; UTF-16 `.length` would be 132).
- 2026-08-27 — browser walk found TWO defects that no test had:
    1. **First-load race (fixed in this slice).** A brand-new creator's very first `/onboarding` load rendered "This workspace is not available" — the layout's idempotent bootstrap and the page render CONCURRENTLY, so `withWorkspace` read before the `users` row existed. Reproduced deliberately (delete the domain `users` row, load the page), fixed with `app/(product)/workspace-scope.ts`, and re-verified: `/onboarding` renders, `/usage` under the identical state still does not — which is what proves the fix closed it rather than a timing accident. Regression is a source scan plus an order assertion, both with non-vacuity probes.
    2. **`/onboarding` was reachable only by a typed URL** — no nav entry. The round-2 NOTE 6 defect, repeated. A link was added to the product layout.
- 2026-08-27 — **PRE-EXISTING DEFECT, REPORTED NOT FIXED:** `/usage` and `/settings/billing` carry the same first-load race, demonstrated in the browser. They are outside slice 1's surface, so they keep their current behaviour; the one-line fix is to route them through `scopeForUser` too.
- 2026-08-27 — mutation matrix: **16 planted, 16 killed.** Two needed work before they died, and both are recorded because the population note is worth more than the count:
    - **M2 (`createProfile` skips `assertScoped`) SURVIVED its first run.** The forgery was still caught — by `workspaceWriteCapabilities` at the END, after the role gate had trusted a forged `role` and after three reads ran against a caller-chosen `workspaceId`. The docblock claimed "assertScoped FIRST" and nothing checked the ORDER. A discriminator test was added (a forged VIEWER must be a `ScopeForgeryError`, not a `ProfileRoleError`); M2 now dies.
    - **M4 (advisory lock removed) initially reddened only ONE of its two Docker tests.** With a cold `pg.Pool`, establishing eight connections takes longer than the first transaction takes to finish, so the racers arrived one at a time and were refused by a cap that was never contended — the suite reported the lock as proven while proving nothing. `warmPool()` opens the connections first; both tests now redden.
    - **M10** (`onboardingInputs` drops the workspace predicate) survived the suite it was aimed at and is killed by `profile-scope.test.ts`'s pre-existing cross-parented-row case — the mutation was mis-aimed, not uncaught.
- 2026-08-27 — **POPULATION NOTE, read before trusting "16 of 16".** These 16 perturb code that EXISTS. Every survivor reviewers found in M2b-1 was a control nobody had written, which no mutation can reach (CLAUDE.md 2026-08-26). Requirements with NO control of their own in this slice, stated plainly: (a) nothing asserts that `/usage` and `/settings/billing` are unaffected by the accessor and `GUARDED_WRITE_FIELDS` changes beyond the existing suites passing; (b) the `capReached` UI branch is reachable ONLY at a configured cap of 0 (at cap ≥ 1 a creator at the cap is already past the create step), so it is tested but close to inventory; (c) nothing proves the advisory-lock ORDER claim (workspace before brain) that slice 2a's G-17 will need — this slice takes only one lock.
- 2026-08-27 — entry-gate PASS on the CI shape, Docker live, zero skips: **45 files / 865 tests / 0 skipped**, up from 41/793. `db:check` clean, `next build` compiles. → `entry-gate-slice-1.txt`
- 2026-08-27 — **self-inflicted incident, recorded because the recovery is the lesson.** A `git checkout -- packages/db/src/with-workspace.ts` written as mutation-test cleanup reverted the file to HEAD and destroyed every slice-1 edit in it (~200 lines). Reconstructed from the session record and re-verified by typecheck, lint, and 64 tests across the four suites that exercise it, then by re-running the five mutations that touch it (all killed). **Never use `git checkout` to undo a planted mutation** — the runner already holds the original in memory and restores it; the checkout could only ever destroy uncommitted work.

## Slice 1 — gate round 1 (2026-08-27)

- 2026-08-27 — **Gate spend and a correction to how it was run.** Four reviewers: tenancy, billing (both `Full gates? yes`, so separate runs even under `Gate intensity: lean`), compliance (R12 honesty + the `input_class` hardcode touch REQ-I03/I04) and production (the person asked for "client ready finish quality"). **The first launch was wrong and was killed:** `isolation: worktree` creates a checkout of HEAD, and this change is UNCOMMITTED, so all four worktrees were two commits behind and contained no `respin/` at all — two agents said so themselves before being stopped. Re-run read-only against the main tree with an explicit no-mutation instruction, which is the R-34 requirement's actual intent (that round's damage came from four *mutating* reviewers sharing a tree, and all four here confirmed they created, edited, moved and deleted nothing). Recorded as a deviation from the phase plan's "reviewers in isolated worktrees": for an uncommitted change, isolation reviews the wrong tree, which is strictly worse than sharing.
- 2026-08-27 — reviewer tenancy: **BLOCK** (1 BLOCK · 4 CHANGE · 5 NOTE)
- 2026-08-27 — reviewer production: **BLOCK** (4 BLOCK · 4 CHANGE · 5 NOTE)
- 2026-08-27 — reviewer billing: **NEEDS CHANGES** (0 BLOCK · 6 CHANGE · 3 NOTE)
- 2026-08-27 — reviewer compliance: **NEEDS CHANGES** (0 BLOCK · 5 CHANGE · 6 NOTE)
- 2026-08-27 — **The honest summary of round 1: the entry gate was green, the mutation matrix was 16/16, and both were true of code with a viewer-writable immutable corpus, a creator's post text going to the logs, and a silently truncated paste.** Every one of those is an ABSENCE — a missing role gate, a missing sanitiser, a missing refusal — which is the class CLAUDE.md's 2026-08-26 lesson says mutation testing is structurally blind to. Third milestone running with that signature.
- 2026-08-27 — fixes applied, by class rather than by field. Full detail in `decisions.md` **R-36**; the short list:
    - `assertMayWrite` on **all five** profile-grained capabilities, not only the browser-reachable one (G-13 closed).
    - `app/(product)/safe-log.ts` — a message is logged **iff we wrote it**. Verified against installed drizzle-orm 0.44.7 that `DrizzleQueryError.message` embeds the bound params.
    - `maxLength` removed from both fields; the limit is stated in copy from the server's own constant, and long input is refused rather than shortened.
    - `onboardingInputs` accessor clamped (`ONBOARDING_PAGE_MAX`), the list paginated and honest when clamped, and the whole stored post readable in a `<details>`.
    - `assertWriteClock` on `createProfile`, with the stale-`at` and future-`at` controls that were missing.
    - The real isolation case for `createProfile` that `COVERED` had been claiming.
    - `table-writers` keyed on `file::verb` — which immediately exposed a `brain_docs` UPDATE writer the file-only key had hidden.
    - The AC-13 enclosure rule tightened to `scopeParams.length === 0`, with the nested-own-scope shape planted.
    - A caller-count scan for `workspaceWriteCapabilities`, which is what actually guards the cap — the two instruments the ledger had named do not.
    - The R12 scan moved off a fixture onto the **closed set of codes this screen can emit**, per word, with word boundaries.
    - Touch targets at 44px, the refusal focusable and focused by a client island, write forms withheld with a stated reason from a viewer or a paused workspace, and a pending-disabled submit.
- 2026-08-27 — **`\b` in a non-raw Python string is a BACKSPACE, and it silently broke three regexes this session** (the cage scan's scope-type matcher, and the whole R12 forbidden list). Each time the regex matched nothing and the guard reported clean. Caught twice by planted-violation probes and once by an esbuild parse error — never by a green run, which is exactly the 2026-08-21 lesson. Every generated file is now scanned for control characters after writing.
- 2026-08-27 — **Browser re-walk after the fix round, against real Postgres.** Verified live, not inferred: no `maxlength` on either field; the limit stated from the server's constant ("up to 80 characters"); the cap sentence now rendered on the **paste** step too ("You are using 1") — the step where the cap refusal is actually reachable; the submit button measured at **44px** tall; a 400-character post truncated in the row with an ellipsis, counted whole (400), and readable in full through "Show the whole post".
- 2026-08-27 — **The two production BLOCKs, confirmed closed by walking them.** A 20,001-character paste reached the server intact (`submittedLength: 20001` — the browser truncated nothing), was refused by name, redirected to `?e=post_content`, rendered actionable copy, left the existing post untouched, and **moved focus to the refusal** (`document.activeElement === the alert`) — which is the half `role="alert"` alone never did on a redirect. And the server log for that refusal reads `{code, errorName, detail}` with the detail being our own authored message: **zero occurrences of the pasted payload in the log**, where before the fix a `DrizzleQueryError` would have printed it verbatim.
- 2026-08-27 — entry-gate PASS after the fix round: **45 files / 891 tests / 0 skipped** (from 865), `db:check` clean, `next build` compiles. → `entry-gate-slice-1.txt`
- 2026-08-27 — one self-inflicted false alarm worth recording: running `pnpm build` while `next dev` was live wrote production chunks under the dev server, so the next page load 500'd on the `RESPIN_TRUSTED_PROXIES` guard (`NODE_ENV=production` has no localhost fallback). Not a defect in this change — the guard working — but a foot-gun: **do not run `build` against a tree with a dev server attached.**

## Slice 1 — gate round 2 (2026-08-27)

- 2026-08-27 — all four reviewers re-run. **Tenancy BLOCK → NEEDS CHANGES · Production BLOCK → NEEDS CHANGES (Not yet/D → Almost/B−) · Billing NEEDS CHANGES (Almost/B− → Almost/B) · Compliance NEEDS CHANGES (Almost/C).** **Zero BLOCKs remain.**
- 2026-08-27 — **Round 2's honest headline: my round-1 fixes created four new defects, and three of them were the same shape as the findings they were fixing.**
    - `assertMayWrite` closed the G-13 BLOCK **and nothing asserted it** — deleting any of the four calls left 891 tests green. A control that exists where nothing checks it, on the fix for the finding that lesson was written about.
    - I gated `recordModelUsage`, which **must never refuse**: it is the A-7 settlement tail, it composes into the generation's transaction, so a refusal rolls back the debit after the tokens are burnt. "Fix the class" applied to the one capability that is exempt. Reverted, with the reason recorded at the call site and a test pinning the direction that must not change.
    - The clamped-list copy rendered **"Showing the most recent 20000"** — the per-post character ceiling where the page size belonged, on the honesty screen, inside copy written to answer a BLOCK about honesty. Found independently by three reviewers; my own clamp test asserted the prose and never the digits.
    - The pause block withheld **both** write forms and told a paused creator "nothing new can be added" — contradicting R-35 §3, written three hours earlier, which says pasting one's own post must NOT refuse under a pause because refusing throws away text the person typed.
- 2026-08-27 — **and two claims I made in the re-gate briefs were false.** I told the reviewers the `plan-unknown` paragraph was "gone — the page no longer renders anything outside `OnboardingView`" (it was still there) and that tests pin that "neither field carries `maxlength`" (only the textarea was pinned; re-adding it to the name field stayed green). Both were mine, not a reviewer's misreading. The paragraph is now inside the component and both fields are pinned.
- 2026-08-27 — round-2 fixes: role-gate tests for every capability · the metering gate reverted with its direction pinned · `pageSize` as its own prop with the digits asserted · pause scoped to the create form only · `errorName` from `constructor.name` (`DrizzleQueryError` never sets `.name`, so the sanitiser reported `"Error"` for the one class it exists for — and the live walk that "confirmed" it threw one of OUR classes, so the foreign branch was never exercised) · `safe-log.ts` given six tests including a **real** `DrizzleQueryError` with a non-vacuity check that the payload IS in its message before asserting it is NOT in ours · a repo-wide scan forbidding a raw error object in any `app/**` log call, with all nine remaining sites routed through `logRefusal` · the closed refusal-code set falling back to neutral copy instead of silently rendering nothing · a per-profile row ceiling (`POST_COUNT_MAX`) closing the unbounded-write half · `app/(product)/error.tsx` and the two unwrapped reads · the caller scan counting CALLS not files · `warmPool`'s precondition asserted where it is relied on · the `state='active'` filter pinned · the expander raised to a 44px target · G-12 re-staged in the **authoritative** register and both stubs and the risk row · R-36's "no path at all" corrected to "no path in the UI" (a server action is a POST endpoint) · `profile_cap` no longer selling an upgrade the interface cannot deliver.
- 2026-08-27 — **THE ENTRY GATE WAS RED WITH EVERY TEST PASSING, and the first fix was wrong.** `Tests 914 passed (914)`, `Errors 1`, exit 1 — `[vitest-worker]: Timeout calling "onTaskUpdate"`, the reporter RPC. Reproduced four times, including twice on an idle machine, so not ambient load. **Hypothesis 1 (worker contention) was falsified by measurement**: capping `maxThreads` to 6 made the run faster (274s → 192s) and it still exited 1. **Hypothesis 2 (console volume) was confirmed in one run**: `--silent` gave exit 0 at 134s. Fixed with `silent: "passed-only"` — a failing test still prints everything it logged, which is exactly when those lines are worth having — the thread cap reverted, and the discriminator recorded in `vitest.config.ts` so nobody widens the setting to hide a real failure.
- 2026-08-27 — entry-gate PASS, CI shape, Docker live, zero skips: **46 files / 914 tests / 0 skipped, exit 0**; `db:check` clean; `next build` compiles; 138s (was 274s). → `entry-gate-slice-1.txt`

## Slice 2a — One metered model call

- 2026-08-27 — started (dependency gate: slice 1 proven on disk — `respin-finish-phase-1-review.md` + `entry-gate-slice-1.txt`)
- 2026-08-27 — **owner decision received: `creditCosts.onboardingBrainRebuild` = 50.** The decision-queue row whose default was *"none is safe — the step stops"* is answered, so the config data step is unblocked. Recorded as `decisions.md` R-37.
- 2026-08-27 — entry-gate PASS (baseline, before any edit), CI shape, Docker live, zero skips: **46 files / 914 tests / 0 skipped**, `db:check` clean (`Everything's fine`), `next build` compiles, 117s → `entry-gate-slice-2a-baseline.txt`. **One honesty note about that file:** the `--- X exit: N ---` lines in it are `tail`'s exit status, not the tool's, because each command was piped. The PASS above rests on the captured OUTPUT (`914 passed`, `Everything's fine`, a completed build summary), not on those lines. Later runs use `${PIPESTATUS[0]}`.
- 2026-08-27 — checkpoint snapshot `claude-jig checkpoint: respin-finish slice 2a`, taken with `git stash push -u` + `git stash apply --index`; `git status --porcelain` diffed byte-identical before and after, because the last session destroyed ~200 lines with an unverified git command.
- 2026-08-27 — **built (packages complete, UI NOT wired — the slice is NOT done).** Landed: `packages/llm` (adapter behind the R1 port, pinned origin plus a socket-level `pinnedFetch` host guard, typed errors that carry their own outcome and billability, nano-to-micro ceiling pricing with a fail-closed lookup); the config `llm` block plus `creditCosts.onboardingBrainRebuild = 50` with seed parity; `getActiveConfigRequiringStored` and `ConfigNotMigratedError` (R19, failing closed on the RAW stored document); a recursing `migrate-config`; migration **0014** (`credit_ledger_inference_debit_uq` — applied, `db:check` clean); `USAGE_OUTCOME_BILLABLE` with compile-time exhaustiveness over the enum; the `countBillableAttempts` scoped accessor; `runInference` with the full ordered spine; `mintProfileScope`; facade and index exports; and refusal copy for seven newly-reachable error classes.
- 2026-08-27 — **five of the repo's own completeness instruments fired, and every one of them was right.** AC-13's scope-taking surface, `profile-scope.test.ts` P3 and P4, the credits isolation enumeration, `facade-errors.test.ts` and the billing-copy completeness check each refused to let a new surface land unenumerated. Two produced findings I would not otherwise have had: **`InsufficientCreditsError` became app-reachable for the first time in the product's life** — `runInference` is the first app-reachable SPEND, and until now every debit was package-internal or webhook-driven — and `stripe/auto-topup.ts`'s two anonymous `new Error` throws became app-reachable with it, both now classed and re-exported. The cross-workspace case behind `runInference` is a real one rather than a name in a set: it proves A's included build is not consumed by B's history.
- 2026-08-27 — **least-confident: the free-attempt tie.** Two concurrent first-ever attempts serialise on the workspace lock in the DEBIT transaction, so exactly one of them is free — but the loser's balance was never checked for the price it is now charged, so its debit can refuse *after* the tokens are burnt. I believe the spend record survives that (R11 commits `model_usage` in its own transaction first) and the ledger stays consistent; what I would bet fails first is that **the Docker race proving it has not been written**, so the claim rests on reading the code rather than on running it.
- 2026-08-27 — entry gate: typecheck 0, lint 0, `db:check` 0, `next build` 0, and **48 files / 958 tests / 0 skipped / 0 FAILED** — but `vitest` **exit 1** on `Errors 1: [vitest-worker]: Timeout calling "onTaskUpdate"`. → `entry-gate-slice-2a.txt`
- 2026-08-27 — **SLICE 1'S FIX FOR THAT FLAKE DID NOT CLOSE IT, and saying so matters more than the number.** `silent: "passed-only"` was recorded as the cause-fixed remedy after `--silent` produced one green run; 44 more tests brought the same reporter-RPC timeout back, at the same zero-failing-tests signature. The `vitest.config.ts` discriminator still holds (zero failed tests, exactly one Errors line naming an RPC method), so this is the known shape and not a hidden failure — but **the entry gate is RED ON EXIT CODE with every test passing**, which is the same sentence slice 1 wrote, and the honest reading is that console volume was *a* cause and not *the* cause. It needs a measured fix, not a second guess, BEFORE the reviewer gates run.
- 2026-08-27 — **STOPPED HERE DELIBERATELY, mid-slice.** Task 6 — the `/onboarding` button and its R18 copy — is NOT built: `runOnboardingInferenceAction` exists in `actions.ts` and nothing renders it. **The acceptance line has therefore not been walked, and this slice is nowhere near done.** Recorded plainly because this plan exists to stop exactly the M2b-1 shape of shipping a package with no caller. Also NOT done: the two Docker races (G-14, the free-attempt race), the G-17 lock-ordering record, the mutation matrix, the browser walk against the real vendor, and all four reviewer gates. **One thing to know about the un-rendered action:** a server action is a POST endpoint invocable by its stable id (R-36 records this), so it is reachable without the button — it is fully gated (session → scope → role → archived → pause → config → balance), but R18's "the button says what it will spend before it spends it" is UNMET, and that is a money surface with no rendered honest copy.

## Slice 2a — the entry-gate exit-code flake (2026-08-27)

- 2026-08-27 — **the flake was diagnosed by measurement on both sides of the RPC, and the previous two explanations were both wrong.** Verified against the installed vitest 3.2.7 rather than from memory: birpc gives a worker→main call a **hard-coded 60s timeout** (`DEFAULT_TIMEOUT = 6e4`, `dist/chunks/index.B521nVV-.js`) and vitest passes no `timeout` through — there is **no config option and no env var** that raises it. So the only available fix is to stop starving the pump.
- 2026-08-27 — instrumented the MAIN thread (a reporter sampling event-loop lag) and the WORKER threads (a setup-file probe). **Main thread never blocked more than ~2.9s** — main-thread saturation falsified. **Worker threads blocked 23–31s solid**, attributed by the probe to `tests/import-boundary.test.ts`, which ran `execFileSync("git", ["grep", …])` twice. Alone that file costs 4.5s; the block is contention, and a synchronous child process stops the **whole worker thread**, including the message pump that answers its own in-flight `onTaskUpdate`.
- 2026-08-27 — fixed at the cause: both call sites awaited via `promisify(execFile)`. Worst observed worker block fell **23–31s → ~10s**; headroom to the 60s wall went from about 2× to about 6×. Four post-fix full runs, CI shape, Docker live: **all exit 0**.
- 2026-08-27 — **the same catch was also failing OPEN and that is fixed with it.** `catch { return [] }` swallowed *any* git failure — git missing, a bad pattern, output past `maxBuffer` — into "no offenders", i.e. a scanner reporting CLEAN without having scanned (the 2026-08-21 lesson). It now discriminates exit code 1 ("no matches", the pass) from everything else, which throws. Proven by planting the swallowing catch back: the probe reddens.
- 2026-08-27 — **regression guard, not a comment:** a source scan over `tests/**` and `packages/*/tests/**` forbidding `execFileSync`/`execSync`/`spawnSync`, with a walk-non-vacuity assertion and a planted violation in `tests/smoke.test.ts` proving it fires. The scanning file is excluded (it holds the specimen strings, which `blankComments` does not blank) and is covered instead by a stricter import-level assertion — `node:child_process` imported exactly once, naming only `execFile`.
- 2026-08-27 — **parallelism measured and REJECTED as the lever, so nobody re-guesses it.** Slice 1 tried `maxThreads: 6` pre-fix: faster, still exit 1. Post-fix `VITEST_MAX_THREADS=8`: **183s against 127s at the default**, with the same 6–9s residual blocks. The residue is PGlite's in-process WASM under contention; fewer workers does not remove it. Default parallelism kept.
- 2026-08-27 — **what is NOT claimed.** The exit-1 signature did **not reproduce once in nine runs this session**, before or after the fix, so this is not closed by reproduction. What is closed is a measured 23–31s starvation source, with the headroom to the hard wall roughly tripled. `silent: "passed-only"` is kept and its comment corrected: it reduces RPC traffic, it was never the cause, and the earlier note that named console volume as "the cause" is now marked as the partial finding it was.
- 2026-08-27 — **a second, unrelated flake was found by the repro runs and fixed.** `packages/config/tests/migrate-config.docker.test.ts` — the admin-append half of the config lock — started the migration and asserted "not settled after 300ms" while merely HOPING `appendConfigVersion` had already taken its lock. Under load it had not, the migration won the lock first, and the case failed with nothing wrong in the product. It now takes an explicit handoff: the wrapped transaction signals **after** the real function body has taken the lock and inserted, and holds open until the test releases it — so no wall-clock guess decides whether the race is set up. A non-vacuity assertion was added: after release the migration must settle, or the case proved nothing.
- 2026-08-27 — **my own tooling reproduced two of this repo's recorded lessons in one session**, both caught by assertions rather than by review: a patch script printed `ok` after a replace that silently matched nothing, and `\b` written in a non-raw Python string emitted a **backspace** into two generated regexes — `/^H(execFileSync|…)^H/` — which matched nothing and would have reported a clean scan. The planted-violation probe is what failed. Every generated file is scanned for control characters after writing.

## Slice 2a — task 6, the `/onboarding` button and its R18 copy (2026-08-28)

- 2026-08-28 — **built and wired.** `runOnboardingInferenceAction` now RETURNS its outcome to a `useActionState` button instead of redirecting, because it spends money and R18 requires the screen to show the charge and the resulting balance — two numbers that exist exactly once, on the value `runInference` returned. The alternatives were both worse and are recorded in `run-state.ts`: a URL turns a balance into a claim anyone can forge (the `?e=` channel is a CODE for exactly that reason), and a re-read would have had to render "no debit row on the newest page" as "it was free", which is absence read as a zero. The precedent is `app/(admin)/admin/config/actions.ts`, which already returns a form state.
- 2026-08-28 — **the R12 forbidden-word scan was narrowed by exactly one word, and the narrowing is replaced rather than removed.** This screen now genuinely spends a credit, so banning "credit" would ban the honesty requirement. "credit" left the list; nine POSITIVE assertions took its place — the price and the balance are stated before the press, the digits track the arguments (not prose), a null price says so rather than showing a number, both numbers pluralise, and the control is absent entirely before a profile exists. Every other banned word stays banned and is still scanned, including on three new rendered states.
- 2026-08-28 — **the model's prompt was changed because the reply is now rendered.** It asked the model to "name one thing a short-form video hook must do", so the vendor's answer would have put a sentence about hooks on the one screen R12 governs. It is now a visible connectivity ping, and the reply is rendered as an attributed quotation ("What the model replied, word for word") — vendor text is not product copy, and a test asserts it is escaped as text rather than rendered as markup.
- 2026-08-28 — **`RunOutcome` was extracted as a pure component because the panel's own states were unreachable from a test.** `useActionState` yields only its INITIAL state under `renderToStaticMarkup`, so a charge or a refusal rendered inside the client panel is a state nothing could drive — on the one control that spends money, on a screen whose stated rule is "every state is reachable from a fixture".
- 2026-08-28 — **`next build` caught a defect that typecheck, lint and 994 tests did not, and it is a class not a field.** `run-outcome.tsx` imported one sentence helper from `copy.ts`; that imports `../billing-errors` for its refusal table; that imports `@respin/credits/app-server` → `@respin/db` → `pg`. The client bundle was handed a Postgres driver and the build failed naming `dns`. Fixed by moving the two sentence functions into `run-copy.ts`, which imports NOTHING — the import graph is the boundary, and a file with no imports cannot cross it.
- 2026-08-28 — **and the class is now guarded**: `tests/client-bundle-boundary.test.ts` walks every `"use client"` module's relative-import graph and fails on the first `@respin/*` value import, reporting the CHAIN rather than webpack's `dns`. Planting the original defect back reproduces `run-inference-panel -> run-outcome -> copy -> billing-errors -> @respin/credits/app-server`. `import type` is excluded (erased before bundling) and that exclusion is itself asserted. The one allowlisted specifier, `@respin/auth/client`, is permitted **on evidence**: a separate case walks its own graph and fails if it ever reaches a server module.
- 2026-08-28 — entry gate after the fix: typecheck 0, lint 0, `next build` **0** (`/onboarding` first-load JS 1.24 kB — no `pg`), suite green.

## Slice 2a — the races (2026-08-28)

- 2026-08-28 — **G-17 is NOT reachable in slice 2a, and the register was wrong about why it would be.** It is homed on "slice 2 takes both locks in one transaction"; `runInference` takes only `takeWorkspaceLock`, and there is no `writeBrainDoc` anywhere in its path. Verified by reading the file. The repo actually has **three** advisory-lock keys, not two — `brain:{ws}:{profile}` (`with-workspace.ts`), the workspace id (`clock.ts`) and `CONFIG_LOCK_KEY` (`config/index.ts`) — and no code path takes two of them in one transaction today. The ordering record is still owed; it is owed by the first path that takes two, which is slice 3.
- 2026-08-28 — **THE FREE-ATTEMPT RACE FOUND A REAL MONEY DEFECT, and the code carried a comment asserting the opposite.** `countBillableAttempts`' docblock read "two concurrent first-ever attempts then serialise on the workspace lock and exactly one of them is free, rather than both". They serialise and **both are charged**: by the time either reaches its debit, BOTH `model_usage` rows have committed (R11 commits the spend record first), so each excludes itself, counts the other, and the creator loses the included build they were promised. Observed as `[50, 50]` where `[0, 50]` was required.
- 2026-08-28 — the cause is that `excludeAttemptId` is **symmetric**, and a tie cannot be broken by a predicate that says the same thing about both sides. No amount of locking fixes that. Fixed with an ORDER: `earlierThanAttemptId` counts only attempts strictly earlier by `(first billable row's created_at, attempt_id)` — a total order, so exactly one attempt in any set has zero predecessors whatever the interleaving. A cheaper-looking rule ("the smallest attempt_id is free") was rejected in writing because it is not monotone: any later attempt sorting below the first would be handed a SECOND free build.
- 2026-08-28 — the missing-row branch of the new ordering **throws instead of answering 0**. Answering 0 would hand out a free build on the strength of a missing record — absence read as an entitlement.
- 2026-08-28 — **B-10 confirmed live and fixed.** `recordPauseStart` took no workspace lock while every ledger writer holds one, so a pause that was inserted-but-uncommitted was invisible to the debit's `hasOpenPause` read: the credits were spent and the pause committed a moment later. Four refusal messages tell a creator "nothing was spent" on the strength of that read. `recordPauseStart` now takes the lock first; it is re-entrant and it is the only lock that function takes, so it introduces no ordering question.
- 2026-08-28 — **MY FIRST PAUSE TEST WAS VACUOUS AND THE MUTATION IS WHAT SAID SO.** It committed the pause outright while the attempt was in flight and asserted the refusal — and it passed with the new lock DELETED, because a committed pause is visible to any later READ COMMITTED read. It tested Postgres, not the control. Rewritten around the interleaving that actually matters (the pause transaction still OPEN when the debit begins) and around a deterministic signal rather than a sleep: it polls `pg_locks` for an ungranted advisory lock, which is the database's own statement that the debit is blocked. With the lock removed the attempt now RESOLVES instead of rejecting — the defect, reproduced.
- 2026-08-28 — four Docker race cases in `packages/credits/tests/inference-race.docker.test.ts`, all green, and the two that carry a control are both proven by planting its removal: the free-attempt tie (`earlierThanAttemptId` → `excludeAttemptId` reddens it) and the uncommitted pause (removing the lock reddens it). The suite loud-skips without `TEST_DATABASE_URL` and its skip message names what goes unproven.
- 2026-08-28 — **G-14 closed.** `packages/db/tests/activate.docker.test.ts` now races the per-profile brain lock: a raw connection holds `pg_advisory_xact_lock(hashtextextended('brain:{ws}:{profile}', 0))` — the exact key, named, so the assertion is about THAT lock and not "some advisory lock was contended" — and a real `writeBrainDoc` must be observed WAITING on it in `pg_locks` before the holder commits. Deleting the lock from `with-workspace.ts` reddens exactly this case and nothing else, which is the state the register said the suite was in.
- 2026-08-28 — two false starts on that case, both recorded because both were the test being wrong rather than the product: holding a second `writeBrainDoc` open inside a drizzle transaction hung (its own internal reads muddy which statement is waiting), and reusing `STRATEGY.positioning` was refused by the R-3 echo bar because the AC-63 case above it had already committed a reference post containing that sentence into the same profile — a correct refusal about the wrong subject.

## Slice 2a — the acceptance walk (2026-08-28)

- 2026-08-28 — **WALKED AND PASSING, against the real Anthropic API and real Postgres.** "Press a button, cause a real Anthropic call, and see the credits and the usage row it produced." A user was created through the real sign-up endpoint, the profile through the real facade, and the button pressed through the **real server action** — the form's own progressive-enhancement POST (`$ACTION_REF`/`$ACTION_KEY` fields submitted exactly as a browser with JS disabled would), not a bypass.
- 2026-08-28 — what the running app showed, verified in the returned HTML rather than inferred: the run panel is **absent** before a profile exists (`run: null`, live); the R18 sentence renders from the real config and the real ledger — *"Your first run for a creator is included. Every run after that costs 50 credits. You have 0 credits."*; the submit control measures **44px**; press → **3.0s**, `claude-sonnet-5`, **48 tokens in / 6 out**, reply `"Message received."` rendered inside the attributed quotation with its label; the charge line reads *"That was your included run for this creator, so nothing was spent. Your balance is now 0 credits."*
- 2026-08-28 — a **third** press exercised the priced path on a zero balance and was refused by name: *"Not enough credits for this — This attempt was refused BEFORE anything was called, so nothing was spent and your included build was not used. Buy an overage pack from Billing, or turn on auto-top-up…"* R18's second half, live.
- 2026-08-28 — **THE FIRST PRESS FAILED, AND IT FAILED CORRECTLY.** It returned `config_not_migrated` — the dev database's stored config predates `creditCosts.onboardingBrainRebuild`, so R19 refused to bill against a defaulted price rather than guess. The rendered copy named the remedy; running it (`pnpm config:migrate`) appended version 5 adding exactly `creditCosts.onboardingBrainRebuild` and `llm`, carried every existing value through unchanged, and modified no earlier row. A refusal whose printed remedy actually works is the shape CLAUDE.md's 2026-07-30 lesson asks for, and this is the first time it has been exercised end to end.
- 2026-08-28 — **THE WALK FOUND TWO NOW-FALSE SENTENCES ON THE TWO MONEY SCREENS, which no test caught.** `/usage` said *"only a generation spends credits"* and `/settings/billing` said *"Nothing can trigger this yet"* about auto-top-up. Both were honest in M1 and both were made false by this slice: the metered run spends credits, and `runInference` gave `maybeAutoTopup` its first caller. A creator who had just watched a run refused for want of credits could read a screen telling them nothing can spend any. The checkbox label ("when a generation would run out of credits") was wrong for the same reason.
- 2026-08-28 — the class is now guarded by `tests/stale-disclosure.test.ts`: each retired sentence is paired with the CODE FACT that falsified it, and **the code fact is asserted too**, so if the capability is ever removed the test fails rather than silently forbidding copy that has become true again. The three tests that pinned the old wording were **updated, not deleted** — the parity case they encoded (the two money screens must not disagree about what spends a credit) survives, asserted negatively on the claim that actually went wrong.
- 2026-08-28 — **a disclosure of ABSENCE is the one kind of copy that rots without anyone editing it.** Every other kind is wrong only if someone changes it; this kind is wrong when the codebase GROWS. Both covering tests stayed green through the change because they asserted the section renders and invents no number, and both stayed true while the sentence stopped being.
- 2026-08-28 — **NOT walked: the browser half.** A Playwright browser from a previous session still holds its profile lock, and killing seven Chrome processes I did not start is not mine to do unasked. What that leaves unproven is only what a real browser adds over the rendered HTML and the real action POST: client-side `useActionState` transitions, the pending-disabled state under a live click, and focus behaviour. The copy, the markup, the touch target, the action, the vendor call, the charge and the refusals were all verified against the running app.

## Slice 2a — the four gates, and fix round 1 (2026-08-28)

- 2026-08-28 — **all four gates run read-only against the working tree; all four returned BLOCK.** Billing (Not yet/D), tenancy (Not yet/D), compliance (Not yet/D+), production (Not yet/D). Spend: 4 reviewers. Run against the main tree rather than worktrees, for the reason slice 1 recorded: the change is uncommitted, so an isolated checkout reviews HEAD and shows the reviewer nothing.
- 2026-08-28 — **THE GATES DISAGREED WITH EACH OTHER ON THE MOST CONSEQUENTIAL FINDING, AND THE MAJORITY WAS WRONG.** Billing (BLOCK) and production (CHANGE) both concluded the free-attempt ordering was truncated to milliseconds by the driver round-trip, making the tie unbreakable in the sub-millisecond window a double-click produces. Tenancy said the opposite and had run the real accessor. **I verified their claim first with raw `pg` and reproduced their error** — default `pg` parsers do return a `Date`, which truncates. The shipping code uses drizzle, whose node-postgres driver installs STRING parsers for `timestamptz`: measured, `min(created_at)` arrives as `2026-08-28 12:00:00.123111+00` at full microsecond precision and the later attempt correctly counts 1 predecessor. **The finding is refuted; the ordering holds.** What was real is the annotation — `sql<Date | null>` was wrong at runtime and is what two reviewers reasoned from. Corrected to `string | null` with the measurement recorded at the site.
- 2026-08-28 — **the honest headline of round 1: the engineering held and the creator-facing half did not.** Three gates independently found the same thing — **four separate false statements about money**, on reachable paths, and one of them I introduced during the earlier copy fix:
    1. `insufficient_credits` said the attempt "was refused BEFORE anything was called, so nothing was spent and your included build was not used" — but `debitCredits` also raises it INSIDE the step-9 transaction, after the model answered and after `model_usage` committed. Three false clauses in one sentence.
    2. `llm_unavailable` said "your included build was not used" for every vendor failure — but `refused` and `schema_invalid` are `true` in `USAGE_OUTCOME_BILLABLE`, so those attempts DO consume the included run and the creator's next press costs full price.
    3. `/usage` said "Nothing has been spent from this workspace yet" **unconditionally**, twenty lines above the ledger table rendering the creator's own debit. The `days-to-empty` sentence six lines below the one I had corrected said the same thing in different words and I had never touched it — the fix was field-level where the finding was class-level.
    4. the auto-top-up copy I wrote in that same fix round implied arming it lets the run through. It does not: `runInference` refuses regardless and returns `TopupInFlightError`.
- 2026-08-28 — **the compliance gate proved a claim of mine false by running it.** I recorded that the R12 forbidden-word scan still covered the new states. It does not reach them at all: `useActionState` yields its INITIAL state under `renderToStaticMarkup`, so the three states added to the scan render the panel and never the outcome. Every string in `run-outcome.tsx` — and the model's reply — sat outside every check. They planted a reply of "We will build your brain and generate your scripts." and it rendered verbatim, suite green. I had extracted `RunOutcome` as a pure component *specifically* so those states could be driven, wrote a block that drives them, and never ran the word loop over it.
- 2026-08-28 — **the tenancy gate found the accessor that prices a debit had no live isolation assertion, and two comments citing tests that do not exist.** The P4 fixture wrote `purpose: "onboarding_brain_build"` while the accessor is driven with `"onboarding_brain"`, so `countBillableAttempts` matched no fixture row: they ran it and got 0 with the cage intact, 0 with the profile predicate dropped, and 0 with no cage at all. A scoping test whose fixture the query cannot see is not a scoping test.
- 2026-08-28 — **FIX ROUND 1 — what was fixed, each with a control and each control proven by planting the defect back:**
    - `PostCallDebitError` — a distinct class for a debit refused after the vendor answered, carrying the `attemptId` so the recorded spend can be found from the refusal. New code + copy; the pre-call refusal keeps its (true) claim and the two are pinned apart.
    - `billingErrorCode` branches on `LlmError.billable` BEFORE the class table, because for a vendor failure the class does not decide whether the creator paid — the instance does, and the flag already travels on the error. New `llm_attempt_recorded` code and copy.
    - `/usage`'s two notes derive from `spendVisibility(rows, moreRows)` with **three** branches, and the middle one is the point: `rows` is a clamped page, so an absent debit on page 1 is not evidence nothing was ever spent. Claiming it would be absence-as-zero, the error this repo has shipped twice.
    - the R12 scan now runs over **24 outcome states** through `RunOutcome`, with the vendor's quotation quarantined (removed before scanning the product's own words) rather than exempted — and a planted promise in a product string of the shipped component reddens it.
    - `countBillableAttempts` and `countOnboardingInputs` got the by-value isolation cases their comments had been citing. Dropping the profile predicate now reddens **two** cases: the new one and the cross-parented one that the fixture mismatch had made vacuous.
    - spend logs name the tenant: `logRefusal` takes server-derived context and `logSpend` records a completed run, which previously wrote nothing at all. Context cannot override the safe fields, and that is asserted.
    - smaller: the auto-top-up copy says the run is still refused; `llm_unavailable` no longer blames "ordinary material" the creator never sent; the outcome's "billed record is on the usage page" is conditional, because the included run creates no ledger row; `ANTHROPIC_API_KEY` documented in `env.example`; the `poolOptions` pointer in `vitest.config.ts` removed (a comment citing a key that does not exist); `decisions.md` **R-38** records the R12/R18 narrowing and phase-1's R12 line is annotated.
- 2026-08-28 — entry gate after fix round 1, CI shape, Docker live, zero skips: **51 files / 1052 tests / 0 skipped / exit 0** (from 1009), `db:check` clean, `next build` clean. → `entry-gate-slice-2a-fixround.txt`
- 2026-08-28 — **ONE BLOCK IS NOT FIXED, deliberately, and it is the largest one.** Production BLOCK 4: there is no concurrency bound on the spend path. `tech-spec.md:116` specifies per-user generation concurrency 2/4/8 and nothing implements it; worse, at `preCallCost === 0` the balance read is **skipped entirely** (`inference.ts:230`) and the seed sets `onboardingBrainBuild: 0`, so N concurrent first presses on a fresh Free workspace all read "no priors", all skip the check, and all reach Anthropic. Our vendor spend is bounded by request concurrency rather than by anything the customer paid. **I verified this myself.** It is not fixed because the honest fix is a session-level advisory lock held across the vendor call, and `packages/credits` is handed a `DbLike` that exposes no connection to hold one on — so it needs a new capability in `packages/db`, its enumeration entries, and a Docker race. That is slice-sized, not fix-round-sized, and bolting on an untested lock at the end of a long session is how the last three defects got written.

## Slice 2a — bounding the spend path (2026-08-28)

Owner decisions taken at the top of this unit, all four as recommended: the concurrency bound is **slice 2a remediation** rather than its own milestone item; the slot is **per workspace**, not per user; the deadline is a **new `llm.overallDeadlineMs` key** rather than a retune of the per-attempt numbers; and the browser walk is **finished**.

- 2026-08-28 — **the seven orphaned Chrome processes were already gone.** `tasklist` found no `chrome.exe` at all, so the Playwright profile lock was stale on disk rather than held by anything. Nothing had to be killed, and the walk ran on the first attempt. The permission was asked for and granted before looking; that ordering is not regretted, but the fact is recorded: the blocker had expired.
- 2026-08-28 — **`tech-spec.md:116` says "per-user" and the limits are keyed to TIERS.** A tier belongs to a workspace here, so a per-user reading multiplies by the seat count — a Pro workspace with five seats would permit twenty concurrent vendor calls, bounding one person's spend and not our vendor bill, which is the thing BLOCK 4 is about. Taken to the owner as a decision rather than resolved silently; recorded as `decisions.md` **R-39** and amended into tech-spec §6 **by that one bullet**, with the neighbours byte-unchanged (the discipline the M2b-2 scope note asks for).
- 2026-08-28 — **THE POOL SPLIT IS A CORRECTNESS REQUIREMENT, NOT TIDINESS, AND I FOUND IT BEFORE WRITING THE WIRING.** A slot is a session advisory lock, i.e. a connection held for the whole vendor call. Taken from the query pool, `pg`'s default `max` of 10 means ten concurrent runs hold every connection, each then needs an eleventh to commit `model_usage` and its debit, `pool.connect()` waits forever by default — and the `finally` that releases the slot sits *behind the wait that never ends*. A hard deadlock, reachable at ten concurrent runs across any workspaces, in the control whose whole job is to stop an outage. `createRunSlotPool` gives slots their own pool with an explicit `max` and a bounded `connectionTimeoutMillis`, so at the ceiling `acquire` refuses rather than queues.
- 2026-08-28 — the semaphore is **N binary locks tried in order**, not a counter: `pg_try_advisory_lock` either takes the key or does not, so there is no read-then-act window and no arithmetic over a stale count can hand out an (N+1)th slot. Session-level rather than xact-level because the slot must outlive every transaction; a table-based slot was rejected in writing because a process that dies mid-call leaks the row forever and eventually bricks the tier — the control becoming the outage.
- 2026-08-28 — **the connect-timeout classification is a STRING COMPARE against a third-party message, and it is not left as an argument.** `pg-pool@3.14.0/index.js:224` constructs a bare `new Error('timeout exceeded when trying to connect')` with no code, no subclass, nothing else to test — verified by reading the installed file. The Docker suite drives the real library rather than pinning the string in two places, and an unrecognised connect error is **rethrown**, so the failure mode of a future rewording is an unmapped refusal and never a granted slot.
- 2026-08-28 — **two refusal reasons, kept apart, because they are two different true sentences.** `workspace_limit` tells a creator to wait for their own runs; `server_capacity` tells them we are full. A creator with no runs at all must never be told they have too many, so `billingErrorCode` branches on the instance before walking the class table (the shape `LlmError.billable` already established) and the class-table fallback is `server_at_capacity` — the one that blames us, which is the only safe direction when we do not know.
- 2026-08-28 — **the deadline is on the REQUEST, not the provider.** `llm.timeoutMs` bounds one attempt and multiplies by `maxRetries + 1` — ~181s inside a server action against §7's 45s. A signal is the only bound that spans the retry loop, which is where the time accumulates. Our own deadline is classified from **our own signal**, not from `APIUserAbortError`: the SDK raises that for any abort and `translate` maps it to `network`, which is right for a cancelling caller and wrong for a bound we set — and the outcome decides whether the attempt consumed the creator's included build. Recorded as **R-40**.
- 2026-08-28 — the two cheap ones. **The bookkeeping no longer masks the vendor error**: `recordUsage` opens a transaction and can fail on its own, and unguarded ITS error left the function instead of `e` — losing the class every downstream decision reads (`billable`, the copy table) and turning a named refusal into "Something went wrong" on a path where money may already be gone. The bookkeeping failure rides out on `cause` rather than being swallowed. **And "Saving…" is gone from the money control**: `SubmitButton` takes a `pendingLabel`, and the run says "Running the model…" — the pending state is the only moment the product can say what is actually in flight, and on a spending control it has to.

### The mutation matrices — and the two things they found that reading did not

- 2026-08-28 — **unit matrix: 6 of 6 RED, but only after one survivor was fixed.** "The concurrency limit is a literal, not the tier lookup" came back **GREEN**: my non-vacuity case asserted the operation asked for `concurrencyLimits.free`, which is **2**, and the planted literal was also 2 — the assertion agreed with the defect. Exactly CLAUDE.md's 2026-08-26 lesson, on a case written *to be* the non-vacuity check. Rewritten to move the config to a value no tier carries (7), so a hard-coded anything fails.
- 2026-08-28 — a second survivor: **the bookkeeping fix had no control at all.** Re-planting the mask stayed green because nothing tested it. Now driven by a Proxy that breaks `db.transaction` only after the vendor has thrown, so the subject is what `runInference` does when its bookkeeping fails rather than a stubbed-out `recordUsage`.
- 2026-08-28 — **Docker matrix: 3 of 4 RED, and the survivor was the most interesting result of the day.** "Release does not unlock" stayed green — and the first explanation was wrong. The mutation replaced the unlock with malformed SQL, which **threw**, which landed in the `catch` that destroys the connection, which made Postgres drop the lock anyway. The mutation was neutralised by a fail-closed path I had written and not thought of as load-bearing; that branch is now commented as what it is. Re-planted as *valid* SQL that simply does not unlock, it went RED against the new case.
- 2026-08-28 — that new case asserts **the lock**, not a later acquire succeeding. A session lock is **re-entrant**, so when the pool happens to hand the next acquire the same connection, a leaked lock is invisible — the leak only bites when the pool hands out a different one, which is a coin flip in a test and a certainty in production. `pg_locks`, filtered to this database, is Postgres's own answer to "is this held"; a proxy the leak can slip past is not a control.

### The browser walk — WALKED, and it found a defect

- 2026-08-28 — the three things the ledger recorded as unproven are now proven, by sampling a **real click in a real browser** rather than by rendering markup: `useActionState` renders the outcome client-side with no navigation; the control goes `disabled: true` / `aria-busy: "true"` **at t=0** and stays there for the whole flight; the new label "Running the model…" appears live; the target measures **44px**. The run was a real Anthropic call — `claude-sonnet-5 · 48 tokens in · 5 tokens out`, reply "Received." inside the attributed quotation, "That was your included run for this creator, so nothing was spent."
- 2026-08-28 — **AND THE FOCUS HALF WAS BROKEN, WHICH IS WHY THE WALK EXISTED.** The moment `SubmitButton` sets `disabled`, the browser drops focus to `<body>` — measured, `document.activeElement === document.body`. The refusal branch of `RunOutcome` carries `role="alert"`, so refusals announce. **The success branch carried no live region at all**, and a page-wide query for `[aria-live],[role=status],[role=alert]` returned an empty list. So a screen-reader user pressed the one control in the product that spends money, lost their place, and was told nothing — while the node quietly rendered the two numbers R18 exists to state. Fixed with `role="status"` (polite, and NOT a focus move — stealing focus on a result the user did not navigate to is its own defect), and covered by a case asserting **both** branches announce, because the defect was that one was thought through and the other was not. Planting the removal reddens it.

### Entry gate

- 2026-08-28 — typecheck 0, lint 0, **51 files / 1069 tests / 0 failed / 0 skipped** (from 1052), `db:check` clean, `next build` clean with `/onboarding` at 1.3 kB first-load JS. CI shape, Docker live. → `entry-gate-slice-2a-bound.txt`
- 2026-08-28 — **no migration, and that is the point of the mechanism**: an advisory lock needs no table, so there is no schema change and `db:check` has nothing to drift against. The two config keys are `.default()`ed and land through `config:migrate`, whose merge recurses (verified by reading `migrate-config.ts:151-172` — an earlier draft of my own comment claimed it was top-level-only, which was false and is corrected).
- 2026-08-28 — three ENUMERATION registries failed and were fixed, exactly as anticipated: the facade error-class completeness check in `tests/billing-ui.test.tsx`, and both the claim registry and the coverage enumeration in `packages/credits/tests/isolation.test.ts`. Each caught a real omission — a new refusal class with no app-facing copy would have rendered "Something went wrong" on the money screen.
- 2026-08-28 — **an untracked `lib/__p6_probe.ts` was poisoning every typecheck**, left behind at 10:18 by an interrupted run of the planted-cast probe in `import-boundary.test.ts` (its `finally` cleans up on any test outcome, but not on a killed process). Preserved to the scratchpad before removal, and the loop closed: `tsconfig.json` now excludes `**/__*_probe.ts`, with the reason recorded next to the probe's writer.

## Slice 2a — gate round 2 and its fix round (2026-08-28)

**Four reviewers, one round. Billing NEEDS CHANGES (Almost/B) · tenancy NEEDS CHANGES (Almost/B) · compliance BLOCK · production BLOCK.** This was the second and final round under the pack's bound.

- 2026-08-28 — **all four verified my least-confident declaration, three of them BY EXECUTION, and it held.** Tenancy drove `pgRunSlots` through ten connection paths with a fake pool; billing and compliance drove it against the live Docker Postgres with a real `createRunSlotPool`. Every path ends in exactly one `release` or `destroy`; a double `release()` is a no-op; the driver returning the string `"t"` does NOT grant (the `=== true` comment is true); after 30 cycles the pool sat at total 2 / idle 2 / waiting 0. The property was sound. **What was missing was the test that said so** — which is the finding all four raised.
- 2026-08-28 — **BLOCK 4 IS DISCHARGED AND THE DEADLOCK ARGUMENT IS VERIFIED, NOT MERELY PLAUSIBLE.** Production read the installed pg-pool: `index.js:88` defaults `max` to 10, `index.js:206` pushes to `_pendingQueue` with no timer when `connectionTimeoutMillis` is falsy — an unbounded wait. Slot holders wait on the query pool; query-pool holders never wait on slots; the split breaks the cycle. The reasoning I wrote from first principles was independently checked against source.

### The three findings more than one reviewer raised

- 2026-08-28 — **THE FEATURE DID NOT REACH A CREATOR AT ALL.** I added the two refusal codes to `billing-errors.ts` and not to `ONBOARDING_ERROR_CODES` in `copy.ts`, which is what `page.tsx` builds `refusalCopy` from — so `run-outcome.tsx` fell through to `unknown`. Compliance proved it by rendering: a creator at their plan's limit read *"Something went wrong … the details are in the server log"*, pointed at a log they cannot open, never told a plan limit exists. **194 UI tests green.** The entry gate had caught three enumeration registries; this was a fourth, and nothing asserted it was complete.
- 2026-08-28 — the fix is CLASS-level, because the instance-level fix has now shipped twice. `tests/onboarding-ui.test.tsx` derives the required code set from the classes `inference.ts` actually constructs, resolved through `CODE_FOR_ERROR_CLASS` + `ERROR_CLASS_COVERED_BY_BASE` the way `billingErrorCode`'s `instanceof` resolves at runtime. **My first draft of that scan was itself fail-open**: it matched `throw new X(` and so missed `TopupInFlightError`, which is thrown from a ternary. Widened to constructions, which over-captures — the safe direction, since it demands more copy and never less.
- 2026-08-28 — **NEITHER POOL HAD AN `'error'` LISTENER, and both production and billing reproduced the crash.** `pg-pool` drops its idle listener at checkout and `pg` emits `'error'` unconditionally on a dead socket; unhandled, that ends the process and takes every in-flight generation with it — including any whose tokens are spent but whose `model_usage` has not committed. **Billing did the thing I should have done and checked whether it was mine: it is not.** The same crash reproduces against a plain `createDb()` pool, so the class is pre-existing. What my change did was widen the window from milliseconds between statements to ~40s on every generation, because a slot connection is deliberately held carrying no traffic. Guards on both pools plus one on the leased client for its lifetime.
- 2026-08-28 — **"Upgrading raises the number" was false and three reviewers found it independently.** `concurrencyLimits` is `{free: 2, creator: 2, pro: 4, studio: 8}`, so the Free creator most likely to read it would pay $10/mo for the same 2, and Studio has nothing above it. It is the defect `billing-errors.ts` records for `profile_cap` twenty lines earlier. Deleted rather than corrected to name Pro: a refusal is not a sales surface, and "wait for a run to finish" is true for every tier including the top one.

### What each reviewer found alone

- 2026-08-28 — **the untested claim, raised by ALL FOUR.** `isRunSlotCapacityError`'s docblock asserted that "the Docker suite exhausts a real pool and asserts this function returns true for what the installed library actually throws." No such test existed. I wrote the sentence intending to write the test and did not — golden rule 1, in the file whose whole subject is a claim that must not rest on an argument. **Production then found what the missing test would have caught**: pg-pool raises a SECOND connect-timeout message at `index.js:276` (`Connection terminated due to connection timeout`) for a slow or restarting Postgres, and my matcher caught only `index.js:224`. So the more operationally likely capacity event fell through to the unmapped rethrow. Hardening against one named counterexample and leaving the class open is CLAUDE.md's 2026-08-18 lesson **for the second time in one session**.
- 2026-08-28 — **CHANGE 6 WAS NOT CLOSED, and production measured why.** `@anthropic-ai/sdk@0.71.2` observes the signal at request boundaries but its retry backoff is `await sleep(ms)` — `internal/utils/sleep.js`, a bare `setTimeout` taking no signal — and it honours a vendor `retry-after` up to 60s. A 429 with `retry-after: 45` put the real ceiling at ~85s against a 40s deadline. My docblock's "a signal is the only bound that spans the RETRY LOOP" was true of the requests and false of the sleeps. `withDeadline` now races the whole call against the signal; the abandoned promise's rejection is swallowed deliberately so it cannot take the process down, and the test that proves it uses a stub that IGNORES the signal — which is exactly what the SDK's sleep does.
- 2026-08-28 — **tenancy: my "disjoint by construction" claim was stronger than what holds.** Every key goes through one `hashtextextended` into one 64-bit space, so disjointness IS the collision improbability I explicitly disclaimed. What is provable — and stronger in one respect than I claimed — is that the key STRINGS are injective for any workspace id, including colon-bearing ones. Reworded to the strength it holds, and `packages/db/tests/run-slot-key.test.ts` asserts injectivity as a property over adversarial id shapes rather than by comparing one pair.
- 2026-08-28 — tenancy also asked for the `as VerifiedWorkspaceId` source scan its profile twin already had. Added as P6b with a planted-cast probe. **Scoped to product source**, because the first run caught my own new test file — and the exclusion is documented along with the fact that P6 diverges (it scans tests too, incidentally rather than by design).
- 2026-08-28 — **the a11y fix I shipped was half a fix, and production said so precisely.** `role="status"` on the outcome was right, but `RunOutcome` returns `null` while pending — so between press and result there was no live region in the DOM at all, and a screen-reader user heard silence for up to 40s on the money control. A region that MOUNTS already populated is also the unreliable half of the pattern, which this repo already knows (`focus-on-mount.tsx`). Now: an always-present region that starts empty and changes, `aria-disabled` instead of `disabled` so focus is not dropped, and a guarded `onClick` keeping the double-submit narrowing that `disabled` used to provide.
- 2026-08-28 — **and the pending label I had just "fixed" was false too.** "Running the model…" asserts a vendor call that SIX refusal paths never make. Now "Working on your run…", true on every path, and scanned at source — because `useFormStatus` yields `pending: false` under `renderToStaticMarkup`, so the label is a state no renderer can reach. The weaker instrument, chosen knowingly, with its weakness named.
- 2026-08-28 — billing asked for the two-transaction split (`model_usage` then debit) to be recorded in the decision log rather than only in a plan, with its cost stated: a crash between the commits leaves a recorded attempt with no debit and nothing reconciles it, and there is no `SIGTERM` handler. **R-41.** The connection guards, the keepAlive/query_timeout bounds and the 26-connections-per-process footprint are **R-42**.

### Entry gate after the fix round

- 2026-08-28 — typecheck 0, lint 0, **52 files / 1092 tests / 0 failed / 0 skipped** (1052 → 1071 → 1092), `db:check` clean, `next build` clean. → `entry-gate-slice-2a-round2.txt`
- 2026-08-28 — **one unexplained single-run failure, recorded rather than dismissed.** The first full run after bounding the query pool's `connectionTimeoutMillis` failed once in `tests/action-gate.test.ts`; it did not reproduce in three later runs (one isolated, three full) and the cause was not established. The bound is a real behaviour change — that pool previously queued forever — so the value was raised 5s → 10s rather than the failure being called unrelated.
- 2026-08-28 — **esbuild caught a defect no test could have.** A docblock I generated contained `packages/*/src`, whose `*/` closed the comment early and broke the file's parse. The same class as this repo's control-character lesson; every generated file is now checked for control characters AND for self-terminating block comments before it is run.

## Slice 2a — CLOSED at Almost, by owner decision (2026-08-28)

- 2026-08-28 — **the owner declined the third gate round and closed the slice.** The report card
  (`../respin-finish-slice-2a-round2-card.md`) put readiness at **Almost** for one reason only: four
  reviewers raised BLOCK-severity findings in round 2, those findings were fixed, and the pack's
  two-round bound meant nothing re-reviewed the fixes. That is a spend decision, not a defect on
  disk, and it belongs to the owner. It was put to them with the alternative (a third round of four
  reviewers before any new feature lands) and they chose to close and move to slice 3.
- 2026-08-28 — **the entry gate was re-run in full before closing, and it EXITED 0.** typecheck 0 ·
  lint 0 · **52 files / 1092 tests / 0 failed / 0 skipped** on the CI shape with Docker live ·
  `db:check` "Everything's fine" · `next build` clean, `/onboarding` 1.38 kB. Evidence:
  `entry-gate-slice-2a-close.txt`. **The reporter-RPC exit-code flake did not reproduce** — the
  master plan's 2a row had recorded the gate as "RED ON EXIT CODE with every test passing", and that
  sentence is now false rather than merely stale, so the row was rewritten. The flake is not
  explained, only unobserved on this run; it is not being called fixed.
- 2026-08-28 — **the master plan's 2a row was materially wrong, not just out of date.** It still read
  "Task 6 (the `/onboarding` button, R18) is not built, so the acceptance line has not been walked",
  and both halves had been false since the entry two days earlier at line 112 of this ledger recorded
  the walk against the real Anthropic API. A status table nobody rewrites is the B-9 defect this plan
  exists to stop reading; it was rewritten in the same action that verified the claims.

### The four findings carried out of 2a, with their owners

| Finding | Severity | Owner / trigger |
|---|---|---|
| `RunInferenceState.code` typed as the full `BillingErrorCode` union, not the screen's closed set | Medium | Engineering. Belt-and-braces; the derived-code test already catches the defect it would prevent. Trigger: any new refusal code on that screen |
| No reconciliation for a `model_usage` row whose debit never landed; no `SIGTERM` handler (R-41) | Medium | **Slice 2b** — it is the slice that gives `model_usage` its first reader, and R-30.9 already owes it a reconciliation query |
| `packages/llm`'s abort-classification branch untested | Low | Engineering. Both routes end non-billable, so the consequence is a message difference |
| Marketing copy "built on mechanisms that perform" | Low | Pre-existing, outside this diff — the outbound-truth machinery |

None of the four is a money-correctness defect. R-41 is the one with a real cost if it is forgotten,
which is why it is homed in a slice rather than left to an owner with no trigger.

## Slice 3 — started (2026-08-28)

- 2026-08-28 — **started.** Card: `../../plans/respin-finish-phase-3.md`. It answers the stub's four
  open questions as recorded decisions rather than leaving them to the build. Owner decisions taken
  first: **R-43** (an `editor` may confirm — the code had already decided this and nobody had recorded
  it; B-1 closed) and **R-44** (`packages/brain` at slice 9, storage stays in `@respin/db`).
- 2026-08-28 — checkpoint `claude-jig checkpoint: respin-finish slice 3` taken with the tree carrying
  all of slices 1–2a uncommitted; `git status --porcelain` was captured before and after the
  stash/apply and **diffed to prove the tree came back identical** rather than assumed.
- 2026-08-28 — **entry gate re-run before starting, and it EXITED 0** — see the slice-2a close entry.

### least-confident: that `assemble.ts` can be a pure function of a FIXED list of claim positions

**It broke, before any reviewer saw it, and the break is the design.** `voice` declares
`signatureMoves: z.array(claim(z.string()))` and `avoid` likewise, and `enumerateClaimFieldsOf` walks
schema and **instance** together — so `/signatureMoves/2` does not exist until the instance has three
entries. **The claim positions of a voice document are an OUTPUT of the inference, not an input to
it.** The first draft took `positions: ClaimPosition[]` and asked the model to fill each one, which is
only correct for an all-scalar schema; `strategy` and `killtest` would have broken it too. Rewritten
to take FIELDS (`{key, kind: single|list, guidance, max}`) and return values per key, leaving the
caller — which is the layer allowed to name a kind — to build the document and derive its pointers.
Recorded because the wrong shape typechecked, tested green against a two-scalar fixture, and would
have been found by the first real `voice` document rather than by the suite.

### Two boundary facts the card did not know

- 2026-08-28 — **`@respin/llm` is DENIED from `app/**` and `lib/**`** by `tests/import-boundary.test.ts`'s
  R6 case, which was written in slice 2a precisely to catch new packages by default. So the card's
  implied shape — a server action assembling a prompt — is impossible, and the composed operation
  belongs in `@respin/credits` beside `runInference`. The boundary did its job on the first slice
  after it was written.
- 2026-08-28 — **the CHECK-marker agreement test moved twice before it landed.** It cannot live in
  `packages/llm/tests` (that would make `@respin/llm` depend on `@respin/db` in dev — most of the
  boundary given away to prove the boundary) and it cannot live in the root suite (the root does not
  depend on `@respin/llm`, deliberately). It lives in `packages/credits/tests/check-marker.test.ts`,
  the one package that already depends on both because composing them is its job.

### The claim I nearly shipped, caught by reading my own docblock

- 2026-08-28 — I wrote that `tests/boundary.test.ts` scans `packages/llm`'s source for a forbidden
  `@respin/db` import. **There is no such file.** That is CLAUDE.md's 2026-07-30 lesson and, more
  pointedly, the *same defect this ledger recorded three entries earlier on 2026-08-28* — a docblock
  asserting a test that was never written, in `isRunSlotCapacityError`. Caught here by checking the
  reference instead of trusting it; the docblock now names what actually enforces the boundary
  (`packages/llm/package.json` has no such dependency) and the R6 eslint case that denies it from the app.

### Deviation from the card's file table

- 2026-08-28 — **`packages/llm` gains a `zod` dependency**, which the card did not list. Reason: the
  reply parser's job is a closed key space over vendor-controlled JSON, and `z.strictObject` is the
  control the repo already relies on for exactly that (`sourceEvidenceEntrySchema`'s TOCTOU lesson).
  Hand-rolled validation of the same shape is where fail-open bugs live. zod 4.4.3, matching `config`
  and `db`. **Proven by importing, not by the installer's exit code** (2026-07-21 lesson): the parse
  tests exercise it at runtime.
- 2026-08-28 — 35 tests green in `packages/llm/tests/assemble.test.ts`. **Non-vacuity proven on the
  control that matters**: making `locateQuote` return a zero-width range instead of `null` for absent
  text reddened 2 tests — the invented-quote refusal is real, not decorative.

**Still to do in this slice:** the composed `inferVoice` operation in `@respin/credits`, the confirm
and activate screens, B-3 (sha over the pair), B-5 (`activated_at` in the CHECK), B-6 (copy), R8's
attestation, the browser walk, and three reviewer gates.

### What landed next: the composed operation and its caller (2026-08-28)

- 2026-08-28 — **`inferVoice` lives in `@respin/credits`, not `@respin/db` and not `app/**`.** Two
  edges force it: `@respin/llm` is denied from `app/**`, and the operation needs `runInference` (credits),
  the active config (`@respin/config`) and `writeBrainDoc` (`@respin/db`) together. `@respin/credits` is
  the only package already depending on all three — the same layering that moved `createProfile` and
  `runInference` there. **It re-implements no gate from slice 2a**; it adds exactly one pre-call
  refusal (too few posts) because that is a property of the operation, not of the money.
- 2026-08-28 — **the claim positions are checked against the enumerator, not assumed.**
  `buildVoiceDocument` constructs `/signatureMoves/0`-style pointers by the RFC-6901 convention and
  `enumerateClaimFields` derives them by walking schema and instance. If those ever disagree the
  document writes, the screen renders, and `activateBrainDoc` refuses **forever** — a silent dead end.
  So the disagreement is a typed refusal at the write.
- 2026-08-28 — **a list whose only value is `[check]` is a ONE-ENTRY list, never an empty one.** An
  empty array enumerates to zero claim positions, so the creator would never be asked about the field
  and activation would pass over it vacuously. That is the same fail-open shape
  `enumerateClaimFieldsOf` already refuses for absent objects, and it took writing the test to see it.

### Two guards caught me, and both were guards this repo wrote for exactly this

- 2026-08-28 — **the facade-error walk refused my bare `new Error`.** The pointer-divergence check
  threw an anonymous Error on a path reachable from a `respinCredits` method, which renders as
  "Something went wrong" because `app/**` can `instanceof` only what the facade exports. Now
  `BrainPointerDivergenceError`, exported, with copy. The guard was written in the 2026-08-17 audit
  remediation and it fired on the first new facade method since.
- 2026-08-28 — **the post-edit hook refused `assemble.ts` for importing an uninstalled `zod`** before
  a single test ran. `packages/llm` gains zod 4.4.3 (matching `config` and `db`) because the reply
  parser's job is a closed key space over vendor JSON and `z.strictObject` is the control this repo
  already relies on for that. Proven by importing at runtime, not by the installer's exit code.

### Non-vacuity, measured rather than assumed

- 2026-08-28 — `locateQuote` returning a zero-width range instead of `null` for absent text → **2 red**
  (the invented-quote refusal is real).
- 2026-08-28 — adding a fifth `claim()` leaf to `voiceContent` → **5 red** in `voice-fields.test.ts`.
  That is the defect the file was written for: a schema widened without widening `VOICE_FIELDS` means
  the model is never asked about the new field, the position still enumerates, and the brain can never
  activate. Two lines of schema, every other test green.

### B-6 closed, and the old copy was worse than the register said

- 2026-08-28 — `brain_kind_not_writable` promised "Log some results first and this document gets
  written from them". The register flagged the missing n ≥ 3; reading it in place, the sentence also
  **tells a creator to go and do something the product cannot do** — results logging is slice 9. The
  new copy names the minimum (three verified comparable results), and says plainly that there is
  nothing for them to do here today.

**Where slice 3 stands:** `packages/llm/src/assemble.ts` + `packages/credits/src/infer-voice.ts` +
the facade + `runVoiceInferenceAction` + config `onboarding.minOwnPostsForVoice` + the three refusal
codes and their copy. **NOT built yet:** the confirm and activate screens (R9–R13), R8's attestation,
B-3 (sha over the pair), B-5 (`activated_at` in the CHECK), tests for `inferVoice` itself, the browser
walk, and all three reviewer gates. **The action has no rendered caller yet**, which is the M2b-1
shape this plan exists to stop — it is mid-slice, not done.

### Entry gate, mid-slice (2026-08-28)

- 2026-08-28 — **exit 0.** typecheck 0 · lint 0 · **55 files / 1138 tests / 0 failed / 0 skipped**
  (CI shape, Docker live) · `db:check` clean · `next build` clean. Baseline at the slice-2a close was
  52 files / 1092 tests, so this slice has added 3 files and 46 tests so far. Evidence:
  `entry-gate-slice-3-partial.txt`. **This is a mid-slice run and the slice is not done.**

### Three completeness guards fired, and every one of them was right

The first full run after wiring `inferVoice` came back with two failed files and four failed tests.
None was a bug in the new code; all four were registries this repo keeps deliberately, refusing to
let a new module or a new scope-taking entry arrive without somebody naming it:

- **`profile-cage.test.ts`** — the pinned `WorkspaceScope`-taking surface grew by two
  (`infer-voice.ts:inferVoice`, `app-server.ts:inferVoice`). Both reach `assertScoped`, via
  `mintProfileScope` as the first statement. Pinned with the reason rather than the list being
  re-generated, because the point of the list is that a new scope-taking entry is a decision.
- **`isolation.test.ts` ×3** — a new source module must be enumerated or internal-with-reason; a new
  `errors.ts` export must be claimed; a new public-entrypoint export must be covered or
  excluded-with-reason. `infer-voice.ts` is internal-with-reason (**it owns no query** — every db
  touch is `mintProfileScope`, `writeCapabilities` or `runInference`, each already isolation-tested),
  and `BrainPointerDivergenceError` is now exported from `index.ts` alongside its sibling classes.

Worth recording plainly: **these guards cost about twenty minutes and caught exactly the class of
omission that produced M2b-1's six surviving mutations** — a control nobody wrote for a surface
nobody registered. They are the reason the mid-slice gate is trustworthy at all.

## Slice 1 — a follow-up caught by the slice-2a work (2026-08-28)

- 2026-08-28 — **`SubmitButton` moved from `disabled={pending}` to `aria-disabled={pending}` plus an `onClick` guard**, correctly: `disabled` drops the element from the focus order, so a keyboard or screen-reader user loses their place on the control that spends money, and `aria-busy` on an unfocused element is announced by nothing. Not reverted — it is a better control than the one slice 1 shipped.
- 2026-08-28 — **but it turned one of slice 1's assertions accidentally vacuous, and nothing noticed for a day.** `tests/onboarding-ui.test.tsx` asserted `toContain("disabled={pending}")`, which is a **substring of `aria-disabled={pending}`** — so it kept passing while the thing it was written to protect moved somewhere else entirely. `aria-disabled` is advisory and does not prevent a submit; the actual refusal now lives in the `onClick` guard, and nothing asserted that. **Deleting the guard would have reopened the double-submit window completely with the suite green** — into a table that still has no dedupe and no delete.
- 2026-08-28 — split into two tests: one for the click REFUSAL (`onClick` → `preventDefault` while pending), one for the aria ANNOUNCEMENT, plus a negative-lookbehind assertion that a bare `disabled={pending}` cannot come back. **Mutation-verified**: removing the `onClick` guard reddens the new test, and did not redden the old one.
- 2026-08-28 — the general lesson, because this is the second time this session a guard passed for the wrong reason: **a substring assertion over source silently survives the code moving underneath it.** A rename that makes the old string a substring of the new one is the worst case, because it is invisible in both directions — the test does not fail, and the diff does not look like it touched a test. Assert the property, and plant the removal.
- 2026-08-28 — entry gate on the CI shape, Docker live, zero skips, with slice 2a's work in the tree: **55 files / 1139 tests / 0 skipped, exit 0**; `db:check` clean. → `entry-gate-0828.txt`

## Slice 3 — the confirm/activate surface, and what the guards caught (2026-08-29)

### The two defects the card scheduled, both closed and both mutation-verified

- 2026-08-29 — **B-3: the confirmation sha now covers the PAIR** `(content, source_evidence)`.
  AC-27 names the pair; the code pinned content alone. The gap is not cosmetic — content is what
  the creator READ, evidence is the quote that made them believe it, so a content-only sha lets the
  justifying sentence be replaced after confirmation (with anything, including a quote from a post
  they never wrote) and activation still passes. **Fixed at the only cheap moment**: one writer, one
  reader, and zero already-confirmed rows in production, because no product path had ever reached
  `confirmBrainDocFields` — which is what this slice changes. Mutation-verified: reverting the sha
  to content-only reddens exactly the two evidence-drift tests and nothing else.
- 2026-08-29 — **B-5: `activated_at` joined the `brain_docs_active_is_confirmed` CHECK**
  (migration 0015), and the nullability half is recorded as a contract on the columns rather than
  changed (`NULL` = never confirmed, `[]` = confirmed and nothing was; the activation refusal counts
  confirmed positions, so it needs the distinction to say an honest number).

### The widened CHECK caught a real violation on its first run, in our own fixtures

- 2026-08-29 — **twenty-one tests in `profile-scope.test.ts` went red immediately**, all inserting
  `status: "active"` with a NULL `activated_at` — precisely the row B-5 says must not exist, in
  tests that were about something else entirely. The constraint doing its job on the day it was
  written. The fixture was corrected; the constraint was not relaxed.

### A mutation SURVIVED, and it is the one worth recording

- 2026-08-29 — planting `attested !== true` out of `appendOwnPost` (R8's whole enforcement) left
  **158 tests green**. Every call site in the suite passed `true`, so the refusal had no witness and
  the guard could have been deleted silently. This is CLAUDE.md's 2026-08-26 lesson happening again
  and being caught by running the mutation rather than by reasoning about coverage: *a matrix is
  blind to a control that was never written*. Three tests now drive `attested: false` — the refusal,
  its ordering before the content check, and the fact that its copy does not claim we verified
  authorship. **The lesson is that a REQUIRED parameter with no default reads like a guard and is
  not one until something exercises the false branch.**

### The completeness registries fired again, and were right again

- 2026-08-29 — `profile-cage.test.ts` (six new scope-taking entries), `gate-completeness.test.ts`
  (two new protected entrypoints), `routes.test.ts` (the middleware matcher), the eslint
  default-deny allowlist (five new names) and `billing-ui.test.tsx`'s facade-error completeness
  (`EvidenceUnreadableError` had no copy) all refused the slice until each new surface was named
  deliberately. None was a false alarm.
- 2026-08-29 — `EvidenceUnreadableError` was given its OWN code rather than inheriting
  `provenance`'s, because the two mean different things to the one reader who can act: ordinary
  staleness is a creator reloading, this is a recorded quote that does not read back from the post
  it names — an operator's signal that would be hidden in the noise if collapsed.

### R12's shape, decided rather than inherited

- 2026-08-29 — the confirm form submits `confirm:<pointer>` AND `shown:<pointer>`. The placeholder
  state the creator SAW travels with the tick and the server refuses a disagreement; deriving it
  server-side would make that disagreement invisible, which is the whole failure the check exists to
  catch. `readConfirmations` drops a tick whose `shown:` is missing or unrecognised rather than
  defaulting it — defaulting would invent a decision nobody made.
- 2026-08-29 — **one submit, not one POST per field.** `confirmBrainDocFields` REPLACES
  `confirmed_fields`, so per-field POSTs would be read-modify-write on a column two tabs can race,
  and the losing tab would silently un-confirm fields the creator had already decided. The per-field
  act is the tick.

### R12's copy rule narrowed a second time, and was paid for

- 2026-08-29 — `"brain"` and `"voice rules"` left `/onboarding`'s FORBIDDEN list, because the
  control now genuinely drafts a voice brain and a button has to be able to say what it does.
  A word leaving a ban list is what a weakened guard looks like, so neither simply left: they were
  replaced by **`learn` / `improve` / `accurate` / `understands you`**, none of which was banned
  before. That is a net tightening of what the screen may claim, plus positive assertions that the
  panel still says a draft binds nothing until confirmed.

### Slice 2a's connectivity ping was RETIRED (owner decision, 2026-08-29)

- 2026-08-29 — the owner chose to retire it rather than ship a caller-less action or a developer
  diagnostic that spends credits on a customer's first screen. `runOnboardingInferenceAction` and
  `RunInferenceState` are deleted; the panel and outcome components were **repointed in place**
  rather than duplicated, so the four gate rounds of accessibility work on them (the always-present
  live region, the pending label that does not claim a vendor call, the announced success branch)
  survive unchanged. The outcome now renders NO model text at all — every inferred rule is shown on
  `/brain` beside its quote or not at all.

### Entry gate, CI shape, Docker live (2026-08-29)

- 2026-08-29 — typecheck **0**, lint **0**, `db:migrate` applied (0015), `db:check` clean,
  **1233 of 1234 passed / 0 skipped** across 59 files. RE-RUN after the browser-walk fixes:
  typecheck 0, lint 0, **1241 of 1242 / 0 skipped**, same single non-slice-3 failure. Evidence:
  `entry-gate-slice-3.txt`. Baseline at the slice-2a close was 55 files / 1139 tests, so this slice
  adds 4 files and 103 tests.
- 2026-08-29 — **the ONE failure is not slice 3's**, and is reported rather than absorbed:
  `gate-completeness` refuses `app/(marketing)/for/[audience]/page.tsx`, an untracked new marketing
  route created in this working tree by the concurrent design/marketing stream. The default-deny
  guard is doing exactly its job — a new public route has to be named on `PUBLIC_ENTRYPOINTS` **with
  a reason**, deliberately, by whoever added it. Declaring somebody else's route public on their
  behalf is the "inherited by omission" this guard exists to prevent, so it is left for its author.
  Two further failures in the first run (`landing-pricing`, and a transient lint on
  `(marketing)/page.tsx`) did not reproduce — that file was being written while the gate read it.
- 2026-08-29 — **`brain-concurrency.docker.test.ts` WAS slice 3's**, and it is the sharper of the
  two B-5 fixture catches. Its eight parallel `active` inserts all failed the widened CHECK, so zero
  survived — and the assertion filters fulfilled results, so "exactly one active version survives"
  was about to pass for the wrong reason on a run where the partial unique index was never reached
  at all. A racer has to be a row the database would really accept, or the index under test is
  never exercised.

**Where slice 3 stands:** built and unit-green — `brain-ops.ts`, the `/brain` route (page, view,
copy, actions), R8's attestation end to end, B-3, B-5 + migration 0015, and 56 new tests
(43 `brain-ui`, 13 `brain-ops`) plus the three R8 refusals. **NOT done:** the browser walk, and all three
reviewer gates (tenancy, compliance, billing — the diff touches `credit_ledger`-adjacent config and
the metered run's caller).

## The browser walk (2026-08-29) — three defects no test could see

Walked end to end against the real Anthropic API: sign up → create profile → paste three own
posts → build the voice brain → read ten rules beside their quotes → confirm each → activate.
Final state verified in the database: `active`, `activated_at` set, `confirmed_at` set, sha 64
chars, **10 confirmed = 10 evidence entries = 10 claim positions**. Screenshot:
`brain-confirmed-active.png` (repo root, beside the slice-1/2a walk screenshots).

**Every one of the three defects below was invisible to 1,234 green tests**, and each was
invisible for a different structural reason. That is the argument for the walk, stated concretely
rather than as a principle.

### 1. Every voice inference failed, after the vendor was paid (the serious one)

`llm.maxOutputTokens` was **1024** — sized in slice 2a when the only operation was a one-sentence
connectivity ping. A voice document with five quoted claims needs ~1,200 output tokens, so the
reply was cut off mid-object and `parseVoiceReply` refused it. The real failed run recorded
`tokens_out: 1024`, hitting the ceiling exactly; the successful one used **1214**.

The cost to the creator was not zero: `runInference` commits `model_usage` and takes its debit
BEFORE the parse (the deliberate A-7 settlement-tail order), so the attempt **consumed the included
build** and the next press would cost 50 credits — and fail identically. Diagnosed by reproducing
the call at 1024 and at 4000 and comparing.

Why no test saw it: the parse tests feed strings, and **no test had ever run the real prompt
against the real ceiling**. Both halves were individually correct.

- Fixed the sizing: `maxOutputTokens` 1024 → 4000 in the schema default and the seed, and appended
  as config **v6** on the live database (v5 byte-identical — the append-only rule held).
  It is a CEILING, not a target: a short operation still emits and is billed for a short reply.
- Fixed the CLASS: `LlmTruncatedError`, thrown from the adapter on `stop_reason === "max_tokens"`.
  The ceiling will be outgrown again as creators save more posts, and when it is, the product now
  says "the answer was cut off" rather than blaming the model's JSON.
- It reports outcome `schema_invalid` rather than a new enum value — a new `model_usage.outcome`
  is a migration on a live enum mirrored in two packages, and for the ROLLUP the two are the same
  fact. The cost (the margin dashboard cannot separate them) is recorded on the class.
- The remedy is routed by a new readable `LlmError.operatorRemedy`, following `billable`'s
  precedent exactly, because the facade exports only the base class to `app/**`. Without it,
  truncation inherited `llm_attempt_recorded`'s "try again" — advice that fails deterministically.

### 2. `/brain` was a 500 on first load — the whole surface of this slice

A `"use server"` module may export **only async functions**, and `readConfirmations` is a
synchronous exported helper. TypeScript is happy, the unit tests import it directly and pass, and
the rule is enforced by Next's compiler — so the only symptom is that the route does not compile.

**This repo already knew the rule and wrote it down**: `app/(product)/onboarding/run-state.ts`
carries the note verbatim, from slice 2a. Moved to `confirmations.ts` + `confirm-types.ts`, the
same directive-free shape that file established.

### 3. Two refusal codes were missing, so a paid failure read as "Something went wrong"

`inference_unusable` and `not_enough_posts` exist in `billing-errors.ts` and were absent from
`/onboarding`'s own `ONBOARDING_ERROR_CODES`, so they degraded to `unknown`. A creator whose posts
had just been sent to a vendor was told the product had malfunctioned.

**Third occurrence of one defect**, and the class-level guard that was built to stop it did not
fire — because its population was `inference.ts` alone, which was the whole spend path when it was
written. Slice 3 added a second (`infer-voice.ts` composing `assemble.ts`) that the scan could not
see. The population is now every source file the screen's spend path throws from, and adding a file
to that list is what a new spend path costs.

**The lesson, which is not "add the code":** a derived guard is only as wide as its population, and
a population written as a single path silently narrows the day a second path appears. The guard
looked like it covered the class and covered one instance of it.

### least-confident (declared before the gates, 2026-08-29)

**The whole-submit confirmation replaces `confirmed_fields` wholesale, so a stale second tab can
silently wipe decisions the creator already made.** `confirmVoiceFields` sets the column to exactly
what THAT form carried. Two tabs open on `/brain`: tab A ticks all ten and submits; tab B, rendered
before that and still showing zero ticks, submits and sets the array back to `[]`. It fails CLOSED
for activation (which then refuses, naming the unconfirmed positions), so nothing false is ever
activated — but the creator's work is gone with no message, and the ledger's own note above argues
*for* whole-submit on the grounds that per-field POSTs would race. Both shapes race; I picked the
one whose race loses work rather than the one whose race records a decision nobody made, and I did
not add the guard (a version/round-trip token) that would close it. This is the thing in the diff I
would bet fails first.

### An OPERATOR obligation the code cannot discharge (2026-08-29)

Raising `llm.maxOutputTokens` in the schema default and the seed fixes **fresh installs only**.
`config:migrate` merges only the keys a stored document is MISSING — every key it already has is
carried through byte-identically from `raw`, deliberately, so that a schema default can never
overwrite an operator's customised value (`migrate-config.ts:103`). `llm.maxOutputTokens` is
already present at **1024** in every database seeded before today, so the migration is a no-op
there and **every voice inference on an existing install keeps failing**, consuming each creator's
included build as it goes.

That is the right shape — this is a cost-bearing dial an operator owns, and silently rewriting it
would be the defect `mergeMissing` exists to prevent — but it means the slice is **not deployable
by shipping the code alone**. The required step, which belongs in the release checklist:

> Append a config version raising `llm.maxOutputTokens` to at least 4000 (via `/admin/config`),
> BEFORE or WITH the deploy. A voice inference on 1024 is truncated, refused, and billed.

Recorded here rather than "fixed" in code because the alternative — special-casing this one key in
`mergeMissing` — would put a schema default back in charge of an operator's value, which is the
invariant that file's docblock is built around. Verified by reading `mergeMissing`, not assumed.

## Reviewer gates, round 1 (2026-08-29) — ALL THREE BLOCKED

Three reviewers, run in the main tree rather than isolated worktrees (a worktree checks out HEAD,
which holds none of this uncommitted work — the review would have been vacuous). Seven blocking
findings. The slice was not ready, and the walk had already shown why that was plausible.

**Least-confident bet, declared before the gates:** the whole-submit confirmation race. Two of the
three reviewers traced it independently and neither found a money or an honesty consequence
(activation fails closed and names the unconfirmed positions); tenancy found it **wider** than I
did — the same UPDATE rewrites `confirmed_by`/`confirmed_at`, so a stale tab rewrites *who decided
and when*, on the only column recording that. Declaring it was worth it: it was the one finding I
had already reasoned about, and the reviewers spent their attention on the six I had not.

### The seven BLOCKs, and what each one actually was

1. **Confirm and activate had no lock** — both read-then-write with a plain SELECT. Under READ
   COMMITTED, activation reads ten confirmed positions, a concurrent confirm commits `[]`, and the
   UPDATE (whose predicate tests only ids) proceeds: `active`, stamped with a real human's
   `confirmed_by`, **zero positions confirmed**. A silent brain activation — the thing R-8 exists
   to forbid. Both now take the same `pg_advisory_xact_lock` `writeBrainDoc` takes.
2. **`/brain` bricked permanently past 50 posts.** `readVoiceBrain` resolved cited posts out of a
   50-row page against a 2,000-post write ceiling; once a cited post aged out, the page refused
   **proposed and active alike**, with no delete path and no un-activate to clear it. Now resolved
   BY CITED ID (`onboardingInputsByIds`), bounded by the document instead of by a page.
   **And my comment called the case "unreachable on the sanctioned path"** while calling 50 "the
   write-side ceiling's neighbourhood" — off by fortyfold. That sentence is why the
   fail-the-whole-page choice looked safe.
3. **The priced corpus silently truncated to 50** while the screen said "the posts you saved above",
   and the class filter ran in JavaScript *after* the page — so once slice 4 lands references, 50
   recent ones would starve own posts out entirely. Now `ownPostsNewest`, filtering on
   `input_class` **in SQL**, with `VOICE_CORPUS_MAX_POSTS` explicit and both counts reported so the
   screen can state the bound.
4. **The config fix could not reach any existing database.** `mergeMissing` adds absent keys only —
   correctly, so a schema default can never overwrite an operator's value — so every pre-slice-3
   install kept `maxOutputTokens: 1024` and kept truncating. I had recorded this as a manual
   release step; the reviewer was right that a manual-only remedy is not a fix. Now a keyed
   `CORRECTIONS` entry that fires **only from the exact value this product wrote** (1024 → 4000)
   and leaves any operator-chosen number alone — asserted in both directions.
5. **A truncation consumed the creator's included build** for a deterministic outage of ours.
   `billable` was answering two questions at once. Split: `billable` still drives the REQ-G05
   rollup, and a new `consumesIncludedBuild` (with a `model_usage.consumed_included_build` column,
   migration 0016, defaulted `true` so no existing row changes meaning) drives the entitlement.
   R14 already stated the principle one case over.
6. **R4's filter — the single line deciding which of a creator's words leave the server — had no
   test at all**, and its comment claimed a second assertion in `assembleVoicePrompt` that does not
   exist and could not (that function receives `id` and `content` only). `infer-voice.test.ts` now
   plants a `reference` row and proves neither its text nor its id reaches the provider;
   mutation-verified (removing the class filter reddens three).
7. **The paste panel told creators their posts stay on this server** — "nothing else reads them yet
   — this screen keeps them, and that is all it does" — two panels above the control that sends
   them to a vendor. A false data-handling statement at the moment of collection, and
   `stale-disclosure.test.ts`, the instrument built for exactly this class, had gained no row for
   it. Rewritten, and the row added.

### The CHANGEs, all fixed in the same pass

R10 failed open for `{isPlaceholder: false, quote: null}` — rendering a rule with no quote, no named
absence, and a checkbox saying "Yes — this is right"; the reviewer **proved it by rendering it**,
while the type's docblock claimed the pairing was unbreakable. `claimsFor` refuses that shape now ·
neither truncation branch was executed by any test (see below) · `prompt_bundle_version` booked
every voice run against `slice2a-smoke-v1` · the truncation discarded the vendor's usage, recording
the most expensive failure as `cost_state: unknown` and biasing margin upward · an empty
confirmation was accepted and stamped an attributable decision over nothing · `brain-view` printed
"You confirmed this." unconditionally, ignoring the prop beside it · the onboarding header still
described slice 2a in three false clauses · "this one stays readable either way" promised a read
path that does not exist.

### The finding that stung, and why it is recorded rather than smoothed over

**Neither new truncation branch was executed by any test.** `complete()` was invoked by no test in
`packages/llm`, so deleting the branch left the suite green — the class-level tests asserted the
error's *properties* and never that anything CONSTRUCTS it. That is verbatim the lesson written into
`CLAUDE.md` earlier the same day, broken within the hour by the person who wrote it. Both branches
are now driven through `underlyingFetch`, and the condition is mutation-verified red→green.

The general shape, which is the part worth keeping: **the two guards I added in this slice were
both un-witnessed in the same way** — R8's `attested` (caught by my own mutation run) and the
truncation branch (caught by a reviewer). Writing a guard and writing its witness are separate acts,
and finishing the first feels like finishing both.

### Copy scans: one canon instead of two

`/onboarding` and `/brain` had grown separate FORBIDDEN lists and diverged in the worst direction —
`/brain` banned `guarantee` and `confiden`; the screen that SPENDS A CREDIT banned neither, on
exactly the words REQ-I04 names. Neither banned `train`, the one word that would falsify
"context, never weights" (R-8) outright. Now one shared canon in `tests/support/forbidden-claims.ts`,
with per-word specimens so a broken pattern cannot hide behind a sibling.

### Entry gate after the fix pass

typecheck **0** · lint **0** · `db:migrate` applied (0016) · `db:check` clean ·
**1257 of 1258 / 0 skipped** across 60 files. The one failure is the same non-slice-3 marketing
route as before. Evidence: `entry-gate-slice-3-round2.txt`.

## Reviewer gates, round 2 (2026-08-29) — and where this stops

Verdicts: tenancy **NEEDS CHANGES**, compliance **NEEDS CHANGES**, billing **BLOCK**. Both round-1
BLOCKs were confirmed closed by all three, on evidence they executed rather than read — compliance
re-rendered the R10 shape and bundled probes with the repo's own esbuild; tenancy tried and failed
to force `onboardingInputsByIds` outside the cage on both axes.

### The billing BLOCK was a defect I INTRODUCED in round 1's fix

Making a truncation non-consuming was right, and it removed the only thing bounding it. Until
`consumesIncludedBuild` existed, every non-consuming outcome was also a ZERO-COST one, so
"does not consume the included build" and "costs us nothing" were the same fact and nothing needed
to count these. `LlmTruncatedError` is the first that is billable to us and free to the creator —
so `priceOf` returns 0, the balance check is skipped entirely, and truncation is deterministic:
a full output ceiling per press, forever, at our expense. **Round 1's defect had bounded it by
accident** (press two cost 50 credits nobody on Free could pay).

Fixed with `onboarding.maxUnchargedBillableAttempts` (3) and `UnchargedAttemptCapError`, refused
before the vendor and witnessed by a test that proves the fourth press never reaches a provider.
Recorded as R-48, whose closing line is the general rule: **a fix that removes an accidental bound
owes a deliberate one.**

### The same un-witnessed-guard defect, for the third and fourth time in one slice

Round 2 found *two more* guards with no witness: the confirm/activate advisory lock (deleting both
`tx.execute` lines left 1226 tests green) and the R10 refusal (deleting it left the suite green,
and it is unreachable through the database, so only a unit test can reach it). Both now have
mutation-verified witnesses. With R8's `attested` and the truncation branch, that is **four** guards
written this slice whose witness I did not write until something forced it.

### What else round 2 caught, all fixed

`ownPostsNewest` silently clamped an EXPLICIT limit — round 1's own defect one layer down, where a
raised bound would have left the read at 50 while the copy stated the new number; it refuses now ·
`llm_truncated`'s copy said "recorded and counted" when the code had just stopped counting it ·
`CORRECTIONS` matched on VALUE, so an operator who deliberately chose 1024 would have had it
quadrupled under a docblock claiming that could not happen — it now requires product provenance
(`created_by`) too · `promptBundleVersion` optional left slice 2a's retired bundle as the default on
a NOT NULL attribution column; required now, and the dead constant deleted · `PLACEHOLDER_ABSENCE`
attributed the absence to the creator's material, the exact shape `run-copy.ts` had already ruled
out — replaced with the compliance reviewer's wording so both surfaces agree · `VOICE_CORPUS_MAX_POSTS`
moved to config (R-49): 50 × 20,000 chars ≈ 250k tokens is over the context window, so a long-form
creator would have hit a permanent `BadRequestError` reading "this is our bug, not yours".

**My own new copy tripped the shared canon** on "we will" — the guard added this slice catching the
person who added it, one hour later.

### Entry gate, final

typecheck **0** · lint **0** · `db:check` clean · **1264 of 1265 / 0 skipped** across 60 files.
The one failure remains `app/(marketing)/for/[audience]/page.tsx`, an untracked route from the
concurrent marketing stream that owes its own `PUBLIC_ENTRYPOINTS` entry. Evidence:
`entry-gate-slice-3-final.txt`.

### STOPPING HERE, deliberately

`implement.md` bounds a gate at **two rounds**, and round 2 is spent. The fixes above are therefore
**unreviewed** — that is the honest status, not a formality: round 2 proved that a fix pass can
introduce a BLOCK, and this pass is larger than round 1's. A third round needs the owner's
go-ahead, asked for at the moment it is wanted rather than assumed.

Residuals the reviewers raised and I did NOT act on, each with their recommendation:
- **The confirmation round-trip token** — tenancy verified it is shippable today (nothing can edit
  `content`/`source_evidence`, so a stale tab can only LOSE ticks, never gain a false confirmation)
  and named the exact shape it needs; it becomes load-bearing at **slice 5**, which edits fields.
  Recorded as an owned obligation on slice 5 rather than built now.
- **The R8 attestation column** — tenancy's answer was *do not add it*: a boolean that can only ever
  hold `true` records nothing and would look like evidence while being none. The honest fix is to
  correct R-47's title and the copy to say the `own_post` label IS the record. **Not done** — it is
  a wording change to a recorded decision and I would rather the owner see the reviewer's reasoning
  first.
- **`app/(marketing)/for/[audience]/page.tsx`** — needs a `PUBLIC_ENTRYPOINTS` entry with a reason
  from whoever added it. It is the only red in the entry gate.
- **`safe-log` / echo-bar span leak** — `assertNoReferenceEcho` interpolates a verbatim span of a
  third party's post into a message that reaches stdout. Not live (no app surface writes a
  `reference` input) and **due at slice 4**, which is where it becomes reachable.
- **`respinCredits.runInference` has no caller** since R-46 retired the ping, and it is the one door
  outside the `own_post` cage. Delete it or give it a caller and a test.
- **`/brain` never scans its refusal copy** the way `/onboarding` does; compliance ran the scan by
  hand and found it clean today, so this is a missing guard rather than bad copy.
- **The corpus bound is still not stated on screen** — `postsUsed`/`postsAvailable` are computed and
  tested and then dropped before the view. Compliance's answer: render it only when it binds, and
  state it unconditionally in the PRE-PRESS sentence, which currently promises "the posts you saved
  above".

## Slice 3 — the close-out pass (2026-08-29, on the owner's go-ahead)

The owner read the stopping report and said to close the slice. Read as three answers: spend the
third gate round on the unreviewed fixes; make the R-47 wording change; leave the marketing route's
`PUBLIC_ENTRYPOINTS` entry to its author (the guard's own rule — declaring somebody else's route
public on their behalf is the "inherited by omission" it exists to prevent).

- 2026-08-29 — **the corpus bound is on screen, both halves, per compliance's recommendation.**
  `preSendSentence(corpusMax)` states the ceiling UNCONDITIONALLY before the press (config-null says
  a ceiling exists and could not be shown — never the old unbounded claim), and
  `corpusBoundSentence(postsUsed, postsAvailable)` renders after a run ONLY when the bound bound.
  The two counts now travel from `InferVoiceResult` through the action's return value — the action
  is where they had been dying — and the `VoiceInferenceState` structural pin was widened by exactly
  the two numeric fields, keeping its no-model-prose property. New states are IN the R12 scans
  ("a clamped corpus" outcome; the view scan reads the real `preSendSentence` through the fixture),
  and the digits are asserted, not the prose (the `pageSize` lesson).
- 2026-08-29 — **`respinCredits.runInference` is DELETED** (the tenancy residual). R-46 retired its
  only rendered caller, leaving it a caller-less POST-reachable door to the model with an ARBITRARY
  prompt — the one door outside the `own_post` cage. The internal `runInference` is untouched (it is
  the spend spine `inferVoice` composes); `RunInferenceParams` left with the method,
  `RunInferenceResult` stays (it is `InferVoiceResult.run`); the scope-cage registry shrank by
  exactly the one entry, with the reason recorded beside the internal function's surviving entries.
- 2026-08-29 — **`/brain` scans its refusal copy** (the compliance residual): every
  `BRAIN_ERROR_CODES` entry through `brainErrorFor` — title AND detail, overrides applied — against
  the shared canon, with a per-scan non-vacuity probe. The instrument compliance ran by hand is now
  a test.
- 2026-08-29 — **R-47's title corrected** to "the `own_post` label IS the record of the
  attestation", with a dated correction paragraph adopting the tenancy reasoning verbatim: no
  `attested` column — a boolean that can only hold `true` records nothing and would LOOK like
  evidence; the label exists only because a caller asserted authorship through the no-default
  parameter, so the label is the record. The verification scope limit stands unchanged.
- 2026-08-29 — **a real test-vs-test race, found by this pass's first full run and fixed at the
  cause.** `import-boundary.test.ts`'s non-vacuity case plants `packages/credits/src/__cage_probe.ts`
  for the lifetime of one assertion; `isolation.test.ts`'s module-enumeration walk reads that
  directory from a CONCURRENT worker, so a well-timed run reported the planted probe as an
  unenumerated credits module (3 failures in one run, 1 in the next — same tree). An interrupted
  earlier run had also stranded the probe past its `finally` (the `__p6_probe.ts` shape again; the
  stray was preserved to the scratchpad before removal). The walk now excludes the documented
  `__*_probe.ts` convention — the convention, not the filename, mirroring the tsconfig exclusion —
  with the race and the reservation recorded at the site.
- 2026-08-29 — entry gate, CI shape, Docker live: typecheck **0** · lint **0** · `db:check` clean ·
  **1271 of 1272 / 0 skipped** across 60 files · `next build` **0**. The one red is
  `(marketing)/for/[audience]/page.tsx`, confirmed by running `gate-completeness` alone — the
  concurrent marketing stream's untracked route, still its author's to declare. Evidence:
  `entry-gate-slice-3-close.txt`.
- 2026-08-29 — **gate round 3 launched: 3 reviewers** (tenancy, billing, compliance), scoped to the
  two unreviewed fix passes only, read-only against the main tree with the no-mutation instruction
  (the change is uncommitted; a worktree reviews HEAD — the same recorded deviation as rounds 1–2).

## Reviewer gates, round 3 (2026-08-29) — ZERO BLOCKS, and the close-out fix pass

Verdicts: tenancy **NEEDS CHANGES** (0 BLOCK · 2 CHANGE · 3 NOTE, Almost/B) · billing
**NEEDS CHANGES** (0 BLOCK · 2 CHANGE · 3 NOTE, Almost/B) · compliance **NEEDS CHANGES**
(0 BLOCK · 1 CHANGE · 2 NOTE). Every prior BLOCK and every named residual was confirmed closed —
by execution where executable: tenancy ran the confirm/activate lock witness live; billing drove
the cap's fourth press into the throwing stub and ran both Docker money suites (12/12); compliance
re-rendered 197 states and caught a planted violation with the new scans. **Round-2's BLOCK fix
(the uncharged-attempt cap) is confirmed real: counted on both cage axes, refused before the
vendor, witnessed non-vacuously.**

Per the pack's rule, CHANGE-and-below findings are **fixed without re-review** — this pass, each
verified red→green by its own test where one exists:

1. **The three 50s are ONE ceiling, enforced not narrated** (tenancy C1): the schema max, the
   accessor's `ONBOARDING_PAGE_MAX` refusal, and `VOICE_CORPUS_MAX_POSTS` were three literals that
   happened to agree, under docblocks claiming a tie. `infer-voice.test.ts` now asserts the
   constant equals the page max and that the schema refuses `ceiling + 1` — drift is a red test,
   not an operator-shaped permanent refusal.
2. **"or write it yourself" deleted from `PLACEHOLDER_ABSENCE`** (tenancy C2): the confirm screen
   hosts no edit box until slice 5; the sentence directed creators to an act the product cannot
   host. The clause returns with the affordance.
3. **`preSendSentence` corrected** (compliance C1): "each one quoting the post it came from" was
   false on the placeholder branch its own sibling copy acknowledges. Now "each one shown beside
   the quote it came from, or marked as unknown when we cannot point to one."
4. **"recent" deleted from both `uncharged_attempt_cap` refusals** (billing C1): the count is
   LIFETIME over an append-only table — no window, no per-profile clearing act. The accepted
   clearing mechanism (operator fixes the cause, raises the global cap) and the self-healing
   upgrade path (count at-or-after the active config version) are recorded as an addendum to
   **R-48**; the copy no longer implies the cap ages out.
5. **The cap's config-not-literal witness** (billing C2): the existing witness drove the SEEDED
   cap of 3, so a planted literal `3` stayed green. A new case stores cap=1 through
   `appendConfigVersion` and proves the SECOND press refuses — the concurrency-limit precedent,
   applied the day the gap was named.

NOTEs, all taken: the confirm/activate lock witness's `pg_locks` poll is now scoped to THIS
database and THIS key (both call sites — cluster-wide counting could go green off a neighbour
suite's contention, a mutation-witness flaking toward green; re-proven live, 16/16 Docker);
the probe-exclusion regex gained its own per-specimen non-vacuity and `packages/credits`'s own
tsconfig now excludes `__*_probe.ts` (the root exclusion never covered the package's own
compile); the `inferVoice` isolation waivers now name the two caged accessor reads they had
omitted; the cap check's docblock states the race bound's real width (overshoot ≤ the tier's slot
limit within one burst, self-closing on commit — accepted, with the exact-count alternative
rejected because it charges where a refusal is owed); `preSendSentence(null)` is its own scanned
state; and the two-read `postsUsed`/`postsAvailable` timing is recorded at the site (a race can
delay the bound sentence by one run, never make it overclaim).

### Entry gate after the round-3 fix pass, and the close

- 2026-08-29 — CI shape, Docker live: typecheck **0** · lint **0** · `db:check` clean ·
  **1274 of 1275 / 0 skipped** across 60 files · `next build` **0**. The one red remains
  `(marketing)/for/[audience]/page.tsx` — the concurrent marketing stream's untracked route, its
  author's to declare. The scoped lock witnesses were additionally proven live before this run
  (activate.docker + brain-concurrency + inference-race: 16/16). Evidence:
  `entry-gate-slice-3-close.txt`.
- 2026-08-29 — **SLICE 3 IS CLOSED.** Three gate rounds (R-51's third round run as three separate
  reviewers — more than the lean merge it sanctioned), zero BLOCKs remaining, every CHANGE fixed
  with a witness and listed above as fixed-without-re-review per the pack's rule. The acceptance
  line was walked in a browser against the real vendor (2026-08-29, screenshot
  `brain-confirmed-active.png`). Residuals routed with owners, not dropped: the confirmation
  round-trip token is slice 5's recorded obligation; the `assertNoReferenceEcho` span leak is due
  at slice 4 where it becomes reachable; the marketing route's `PUBLIC_ENTRYPOINTS` entry stays
  with its author. Report card: `../respin-finish-slice-3-card.md`.

## Slice 2b — The spend record that outlives deletion

- 2026-08-29 — started (dependency gate: slice 2a shipped 2026-08-28; slice 3 CLOSED at Ready
  2026-08-29, satisfying the card's "does not land on top of an unreviewed round" prerequisite;
  R-54 pseudonymisation delegated same day)
- 2026-08-29 — least-confident: **the R-41 `unbilledAttempts` exclusion of
  `consumed_included_build: true`.** The reconciliation query cannot re-run
  `packages/credits`' pricing decision without inverting the dependency graph
  R3's docblock forbids, so a truncated-but-free first attempt (marked
  `consumed_included_build: false` per R14's own-fault exception) can appear
  in the unbilled list as a false positive. Documented in `spend-rollup.ts`'s
  own docblock and treated as an accepted imprecision for a "report, not a
  repair" instrument — this is the piece most likely to need revision under
  reviewer scrutiny.
- 2026-08-29 — **built.** Landed: `spend-rollup.ts` (`periodMonthUtc`,
  `upsertSpendRollup`, `pseudonymiseWorkspaceSpend`, `reconcileSpend`);
  `with-workspace.ts`'s `recordModelUsage` composes the rollup upsert into its
  own transaction (R1) and gains the standalone `monthlySpend` (R7);
  `packages/credits/src/burn-period.ts` (`burnPeriodStart`, R7's period
  authority); `/usage`'s burn-total panel + simplified by-mode note (R8/R9);
  `/admin/margin` + `margin-view.tsx`, the minimal operator reader with its
  own forbidden-word scan (R14/R15); the registry's pseudonymisation answer
  and `tests/retention-pseudonymisation.test.ts`'s deletion-executor tripwire
  (R16/R17). Three of the repo's own completeness instruments fired
  correctly and were fixed in-slice: `profile-cage.test.ts`'s AC-13 pinned
  list (the new `monthlySpend` scope-taking pair), and
  `packages/credits/tests/isolation.test.ts`'s two enumeration checks (the
  new `burn-period.ts` module and its `burnPeriodStart` export) — each
  required a real decision (which list, which reason), not a rubber stamp.
- 2026-08-29 — R6 (the shared-fate atomicity) found a real bug in ITS OWN
  first draft, not in the product: `spend-rollup.docker.test.ts`'s first
  version called `caps.recordModelUsage(usage)` with no `tx`, which runs each
  write as its own auto-committing statement — the poisoned-rollup case
  "passed" its own `rejects.toThrow()` while the model_usage row it expected
  rolled back sat there committed. Fixed by wrapping every call in
  `db.transaction(...)`, mirroring the real call site
  (`packages/credits/src/inference.ts:725`) exactly; both directions now pass
  on real Postgres with `ALTER TABLE ... CHECK (1=0) NOT VALID` poison
  constraints.
- 2026-08-29 — entry gate, CI shape, Docker live: typecheck 0, lint 0,
  `db:check` clean (`Everything's fine`), **1324/1325, 0 skipped** — the one
  red is the pre-existing `(marketing)/for/[audience]` gap from the
  concurrent marketing stream, confirmed unrelated (present before this
  slice's first edit, per the `/sync-docs` session that ran immediately
  before this build). `next build` clean, `ƒ /admin/margin` present.
  Evidence: `entry-gate-slice-2b.txt`.
- 2026-08-29 — Decisions: `decisions.md` R-57 (same-transaction rollup, its
  stated cost, and the burn/margin split, alongside R-54's already-recorded
  pseudonymisation answer). Master plan's slice-2b row corrected to match.
- 2026-08-29 — **round 1: billing BLOCK, tenancy NEEDS CHANGES — both run in
  the main tree** (nothing in this slice is committed; a worktree would have
  reviewed stale HEAD, the same deviation slice 3's round 3 recorded and for
  the same reason). Billing found **two real BLOCKs in the two headline
  numbers**: `monthlySpend` summed `delta < 0` with no `kind` predicate, so a
  lazily-materialized `expiry` row (or a negative `adjust`) counted as
  creator burn; and `unbilledAttempts`' filter was INVERTED —
  `consumedIncludedBuild` is `true` on every SUCCESSFUL attempt
  (`inference.ts:546`), never a "this was priced" marker, so the filter both
  excluded every real R-41 crash case and flagged every non-consuming
  failure as permanent noise, while the suite's own test proved it by
  planting a row shape (`succeeded` + `consumedIncludedBuild: false`) the
  real write path can never produce. Both reviewers independently also
  flagged `recordModelUsage`'s optional `tx` — a cast (`conn as TxLike`)
  defeated `upsertSpendRollup`'s own "type error, not runtime one" claim,
  and several PRE-EXISTING slice 2a/3 tests already called it bare. Tenancy
  additionally found: `monthlySpend` had no adversarial cross-workspace
  test; and `reconcileSpend`'s orphaned/drift classification is
  workspace-grained while deletion could in principle be profile-grained —
  not reachable today (profiles are archived, never individually deleted;
  only whole-workspace REQ-A04 deletion removes a `creator_profiles` row,
  cascading every profile in the workspace at once), documented as a known
  limitation with a fixture proving the shape rather than closed.
- 2026-08-29 — **fix round.** `monthlySpend` now filters `kind = 'debit'`
  explicitly (two new tests: an expiry row and a negative adjust row both
  correctly excluded). `unbilledAttempts` rewritten on the REAL
  discriminator — rank, not a column: a window-function query
  (`ROW_NUMBER() OVER (PARTITION BY profile_id, purpose ORDER BY created_at,
  attempt_id)`) marks a successful attempt unbilled only when it is NOT rank
  1 for its partition (not the free first build) and has no matching debit;
  four rewritten tests prove first-is-free, second-is-unbilled,
  second-with-debit-is-not-unbilled, and partitioning is per-profile (a
  different profile's first attempt stays free even after another profile's
  second). `recordModelUsage`'s `tx` is now REQUIRED (matching its sibling
  `writeBrainDoc`), the cast is gone, and every call site across THREE
  files — `onboarding-ops.test.ts` (1), `profile-scope.test.ts` (6, all
  pre-existing from slices 1/2a/3), `spend-rollup.test.ts` (this slice's
  own, ~20, via a new `record()` test helper) — now wraps in
  `db.transaction(...)`. `reconcileSpend`'s `date_trunc` is now pinned `AT
  TIME ZONE 'UTC'` explicitly (billing's fourth finding, not previously
  called out above: session timezone was unpinned anywhere in the repo).
  Added: the T1 cross-workspace test for `monthlySpend` (workspace B's debit
  10x workspace A's never leaks into A's total); the documented-limitation
  test for the profile-grain gap. Full entry gate re-run clean: typecheck 0,
  lint 0, **849/850** PGlite (the one red still the pre-existing marketing
  gap), **34/34 docker tests** including the money-invariant concurrency
  suites, `db:check` clean, build clean. Round 2 of both reviewers launched
  next.
- 2026-08-29 — **round 2: tenancy PASS (Ready, Grade A); billing NEEDS
  CHANGES (Grade C).** Tenancy verified all three round-1 fixes correctly
  and completely, including re-running R6's docker test live. Billing
  confirmed three of its four round-1 items fixed (`kind='debit'`, the
  required `tx`, the UTC-pinned `date_trunc`) but found the `unbilledAttempts`
  rewrite itself introduced a NEW, narrower gap in the exact property its own
  docblock claimed: the window function ranked `WHERE outcome = 'succeeded'`
  only, but `countBillableAttempts` (the real pricing logic it claims to
  mirror) ranks `outcome IN BILLABLE_USAGE_OUTCOMES AND consumedIncludedBuild
  = true` — and `BILLABLE_USAGE_OUTCOMES` includes `refused` and
  `schema_invalid`, not only `succeeded`. `LlmRefusedError` is billable AND
  consumes the included build (`packages/llm/src/errors.ts`), so a profile
  whose FIRST attempt is a policy refusal has already spent its free slot —
  the real pricing logic then prices the SECOND (first-successful) attempt,
  but the narrower rank query put that attempt at rank 1 and silently
  excluded it from the unbilled check, on exactly the row most likely to
  carry a real R-41 crash. Independently re-verified against the actual
  `countBillableAttempts` predicate (`with-workspace.ts:825-836`) and
  `LlmRefusedError`'s constructor (`packages/llm/src/errors.ts:149-157`) —
  the finding is correct. Billing also flagged the burn-rendering branches
  in `usage-view.tsx` (`hasAnyDebit: true` and `ok: false`) as untested — a
  mutation that always rendered "Nothing spent this month" would have
  passed every existing test.
- 2026-08-29 — **fix round 2.** `reconcileSpend`'s window function now ranks
  the SAME wide population `countBillableAttempts` uses (`outcome IN
  BILLABLE_USAGE_OUTCOMES AND consumed_included_build = true`), carries the
  `outcome` column through the ranking subquery, and restricts the OUTER
  "unbilled" candidates to `outcome = 'succeeded'` only (refusals never
  reach the debit step, so they can never themselves be unbilled — but they
  must still occupy a rank so a later successful attempt's true rank isn't
  understated). New test plants the exact scenario: a `refused` first
  attempt (billable, consumes the build) followed by a `succeeded` second
  attempt with no debit — asserts the second IS unbilled and the refusal
  itself is NOT. Two new `billing-ui.test.tsx` cases cover the
  previously-untested burn branches (`hasAnyDebit: true` renders the real
  number; `ok: false` renders the error state, not a false zero). Full
  entry gate re-run clean: typecheck 0, lint 0, **1299/1334** (34 skipped
  without `TEST_DATABASE_URL` in that run — separately confirmed
  **23/23 docker tests** including `spend-rollup.docker.test.ts`,
  `concurrency.docker.test.ts`, `inference-race.docker.test.ts** all pass
  live), the one red still the pre-existing marketing gap, `db:check`
  clean, build clean.
- 2026-08-29 — **owner approved round 3** (asked at the moment, per the
  gate's own rule) rather than closing on round 2's evidence.
- 2026-08-29 — **round 3: billing NEEDS CHANGES again (Grade B), one new,
  narrower finding.** `reconcileSpend`'s ranking now correctly matched
  `countBillableAttempts`'s POPULATION (round 2's fix) but not its GRAIN:
  `countBillableAttempts` counts DISTINCT `attempt_id`s
  (`countDistinct(modelUsage.attemptId)`, with-workspace.ts) because
  `onboarding-schema.ts`'s own docblock plans for "a bounded retry writes
  two rows" per logical attempt — and the ranking window function ranked
  every ROW, not every ATTEMPT. Reviewer proved this empirically (a scratch
  test, created/run/deleted) with two rows sharing one `attempt_id`
  (`schema_invalid` then `succeeded`): the succeeded row was wrongly
  flagged unbilled despite being the legitimate free build. **Confirmed
  NOT live-reachable today** (every server-action caller mints one fresh
  `attemptId` per press; `recordUsage` is invoked at most once per
  `runInference` call) — a correctness gap in an admin-only "report, not a
  repair" diagnostic (its own docblock; the margin page already tells
  operators to confirm each row individually), hence CHANGE, not BLOCK.
- 2026-08-29 — **fix round 3.** `reconcileSpend`'s query restructured as a
  two-stage CTE: first groups `model_usage` to `(profile_id, workspace_id,
  purpose, attempt_id)` — `MIN(created_at)` as the attempt's instant
  (matching `countBillableAttempts`'s `me.firstAt` semantics) and
  `bool_or(outcome = 'succeeded')` as whether a debit is ever expected for
  it — THEN ranks at attempt grain, THEN restricts to attempts that
  succeeded. New test plants the exact scratch-test scenario as a
  permanent fixture: two rows, one `attempt_id`, `schema_invalid` then
  `succeeded` — asserts the attempt is never reported unbilled. Full
  gate re-run clean: typecheck 0, lint 0, spend-rollup.test.ts
  **24/24** (up from 23 — the new test), **47/47** across the four
  targeted docker/PGlite suites together, `db:check` clean, build clean.
- 2026-08-29 — **STATUS: three billing rounds run (BLOCK → NEEDS CHANGES →
  NEEDS CHANGES), severity and reachability strictly decreasing each
  round — round 1's two BLOCKs were live and reachable; round 2's finding
  was live but on an admin-only report; round 3's finding was NOT
  reachable through any code path today.** Every named finding across all
  three rounds is fixed and has a permanent regression test. Tenancy is
  PASS/Ready since round 2. Per this project's gate discipline a fourth
  round needs the owner's explicit go-ahead, asked for at that moment —
  not launched automatically. The two "can…" browser walks remain a
  separate, recorded residual (no live Anthropic key confirmed available
  this session).
- 2026-08-29 — **owner asked (AskUserQuestion) whether to run round 4,
  close as Ready now, or stop for a manual review; chose "Close as Ready
  now."** Slice 2b **CLOSED at Ready.** Master plan's slice-2b row updated
  ✅ (`respin-finish-master-plan.md`); report card written at
  `../respin-finish-slice-2b-card.md`, following the format of the
  slice-2a and slice-3 cards, naming the two browser walks explicitly as
  the residual rather than claiming a pass. No further billing rounds
  planned for this slice.

## Slice 4 — References + the R-3 promise

- 2026-08-29 — started (dependency gate: slice 3 proven on disk — `respin-finish-slice-3-card.md`, closed at Ready). Checkpoint snapshot taken (`Checkpoints: on`): `git stash push --include-untracked` + `git stash apply --index`, tree byte-identical before/after.
- 2026-08-29 — **built.** `appendReferencePost` as a sibling of `appendOwnPost` (`onboarding-ops.ts`) — no `attested` parameter, optional `sourceUrl`, its own `REFERENCE_COUNT_MAX` (50) checked ahead of the shared `POST_COUNT_MAX`. G-11 Layer A: `referenceBudgetKey` — sha256 over `echoComparisonForm` further trimmed and whitespace-collapsed (`budgetComparisonForm`) — replaces `content_sha256` as the budget's aggregation key; `content_sha256` itself untouched. G-11 Layer B: `groupReferenceInputs` — union-find over the profile's live reference corpus, folding Layer A's exact-form matches and `findEchoWindow`'s shared-span matches into one bucket map, computed once per write and shared between `validateSourceEvidence`'s new spans and `retainedReferenceSpans`'s retained spans. G-16: `isUsableSpanRange` is now the one predicate both `assertUsableSpan` (echo.ts, refuses a bad NEW span) and `retainedReferenceSpans` (with-workspace.ts, now SKIPS a bad STORED span instead of only checking `Number.isInteger`) share. G-10: a third bijection direction added in `writeBrainDoc` — every CITED evidence entry must name a claim position holding a STATED value, never `[check]`. R-30.10: `REFERENCE_BARRED_KINDS` widened `{voice}` → `{voice, killtest, performance_meta}`; `strategy` stays exempt (REQ-D04). New `ReferenceEchoError` class (errors.ts) separates the R-3 echo/budget refusal from the generic `ProvenanceError` quote-mismatch refusal, with its own `reference_echo` code and copy in `billing-errors.ts`. UI: a second onboarding panel ("Add posts you admire") — paste + optional source URL, no attestation control, its own count sentence against `REFERENCE_COUNT_MAX` — wired through `addReferencePostAction`; the "Your posts" list now filters to `own_post` only, and a companion reference list reads separately (own-post page window and reference-post window are different sizes, so a shared read would silently truncate one of them).
- 2026-08-29 — **least-confident: the coordinate-space mixing inside `assertReferenceQuoteBudget`'s per-bucket union.** Caught by my own new tests, not by a reviewer: when Layer B buckets TWO DIFFERENT `onboarding_inputs` rows (a full reference post and a separately-pasted excerpt of it), their UTF-16 offsets are two different coordinate spaces, and the original `group()`/`unionLength` pair unioned raw numeric ranges ACROSS `inputId`s as if they measured the same axis — silently UNDER-counting whenever two different rows' offsets happened to overlap numerically. Fixed by unioning WITHIN one `inputId` (safe, same coordinate space) and SUMMING across `inputId`s within a bucket (the conservative direction — can only over-count material genuinely from the same post, never under-count). A second self-found defect: `referenceBudgetKey`/`groupReferenceInputs`'s Layer A originally keyed on `echoComparisonForm` alone, which does not trim or collapse whitespace (` ` is outside both `\p{Cf}` and `\p{Default_Ignorable_Code_Point}`) — so the register's own running example ("a trailing space mints a fresh budget") was NOT closed by the first version. Fixed with `budgetComparisonForm` (`echoComparisonForm` + `.trim()` + whitespace-run collapse), used by both `referenceBudgetKey` and `groupReferenceInputs`'s Layer A dedup.
- 2026-08-29 — entry gate PASS, CI shape, Docker live, `TEST_DATABASE_URL` set: **67 files / 1379 tests / 1378 passed / 0 skipped**. The one failure is the pre-existing `(marketing)/for/[audience]/page.tsx` gate-completeness gap recorded in slices 2b and 3's ledger entries as belonging to a concurrent marketing stream, not this slice. `db:check`: clean (no migration — `input_class` already had `reference`, `source_url` already existed, matching the phase card's prediction). `next build`: clean, `ƒ /onboarding` compiles.
- 2026-08-29 — mutation-plantable population named, not yet run as a formal round: `M1` (budget key reverts to `content_sha256`) — the "Layer A: a trailing-space duplicate shares ONE budget" test in `echo.test.ts` is its witness. `M2` (bucket disabled) — the excerpt-sharing tests in `echo.test.ts` and `groupReferenceInputs`'s own tests. `M3` (`[check]`-position entries permitted again) — the G-10 test in `activate.test.ts`. `M4` (`REFERENCE_BARRED_KINDS` reverted) — `reference-echo.test.ts`'s per-kind cases. `M5` (never-brick short-circuit removed) — the "never-brick re-proved on the bucketed path" test in `echo.test.ts`. `M6` (reference intake reuses `appendOwnPost` with a class parameter) — `appendReferencePost`'s own dedicated function plus `table-writers.test.ts`'s writer enumeration (still one writer, `appendOnboardingInput`, for both callers — a class-parameter mutation would not change that count, so this mutation's real witness is R1's design itself: there is no `input_class` parameter to pass). `M7` (`assertUsableSpan` permissive on inverted ranges) — the reference-quote-budget "refuses an INVERTED range" test (pre-existing, still exercises the shared predicate). `M8` (refusal copy → "Something went wrong") — the R12/R13 forbidden-word scan in `onboarding-ui.test.tsx`. **Not independently verified by planting and running each mutation this session** — recorded as a residual for the reviewer gate to weigh, consistent with this project's standing lesson that a matrix authored by the same person who wrote the guards is blind to the same classes of gap.

## Slice 4 — gate round 1 (2026-08-29)

- 2026-08-29 — **gate spend announced: 3 reviewers — respin-tenancy-reviewer (brain-doc writes, provenance, new accessors — Full gates), respin-billing-reviewer (the diff's main surface is `with-workspace.ts`, which also composes `recordModelUsage` and the money-adjacent advisory lock — Full gates, run out of collateral-risk caution though no money path is touched), respin-compliance-reviewer (this slice is R-3's live-fire switch-on plus REQ-I03/I04 copy — run as its own full agent rather than a hand-authored lean-merge prompt for a single lean-eligible path).** `respin-learning-reviewer` EXCLUDED — nothing in this diff touches results entry, promotion proposals, or `packages/brain`; the phase card's "Done when" line names it generically but the actual diff does not trigger it, and CLAUDE.md's rule is gates run on what a diff touches. All three read-only, briefed with the specific file list (the branch has many prior slices uncommitted, so `git diff` against HEAD was explicitly ruled out as a scoping tool) and the least-confident declaration (the coordinate-space union fix).
- 2026-08-29 — reviewer billing: **PASS** (Ready/A, zero findings). Verified the advisory-lock-vs-corpus-fetch reordering directly via `git diff HEAD -- with-workspace.ts`, confirmed `recordModelUsage` untouched, confirmed `ReferenceEchoError`'s `HANDLERS` ordering and the new constants' config-vs-code provenance against R-58.
- 2026-08-29 — reviewer tenancy: **NEEDS CHANGES** (0 BLOCK · 1 CHANGE · 1 NOTE). The CHANGE: `page.tsx`'s two display reads (own-post list, reference-post list) filtered by `input_class` in JavaScript AFTER paging — the exact anti-pattern `ownPostsNewest`'s own docblock names and closes for the INFERENCE path, reopened on the DISPLAY path now that `reference` rows exist: a creator with more of one class than the page size sees the other class's list wrongly collapse or undercounts. The NOTE (the bucket-merge-across-writes scenario, my own least-confident bet) was traced by hand and found sound — no defect, but untested; carried forward as a residual, not fixed.
- 2026-08-29 — reviewer compliance: **NEEDS CHANGES** (1 BLOCK · 1 CHANGE · 2 NOTE). The BLOCK: the reference panel's "nothing here is copied" is an unqualified guarantee that is FALSE for `strategy` — `REFERENCE_BARRED_KINDS` deliberately exempts it and `REFERENCE_QUOTE_MAX_CHARS` exists precisely so up to 240 characters may be quoted verbatim as mechanism evidence (REQ-D04). The CHANGE: `PostContentError`'s stale "…and nothing else reads it yet" claim, now wired into two new slice-4 call sites. The two NOTEs: the banned verb "learn" surviving in two server-log-only messages (`ReferenceEchoError`, `assertNoReferenceEcho`'s throw), and the mutation-matrix-not-independently-planted residual (already recorded above, independently found).
- 2026-08-29 — **fixes applied for both CHANGE-and-above findings, by class:** `ProfileAccessors.onboardingInputs` gained an optional `inputClass` parameter applied as a WHERE-clause predicate (not a post-page filter), threaded through `listOnboardingInputs` and `respinDb`'s binding; `page.tsx`'s two reads now pass the class and the JS `.filter()` calls are gone; a real-database regression test proves the starvation scenario is closed (`onboarding-ops.test.ts`, "tenancy gate CHANGE (slice 4 round 2)"). The reference panel's guarantee sentence rewritten to name what IS true (own writing rules never built from a reference post's wording) without the false "nothing here is copied". `PostContentError`'s stale clause removed. Both NOTE-level "learn" reword sites fixed too (batched in, no re-review required for NOTEs).
- 2026-08-29 — entry gate re-run after the fix round, CI shape, Docker live: **67 files / 1380 tests / 1379 passed / 0 skipped** (the one red is still the pre-existing marketing-route gap). `db:check` clean, `next build` clean.

## Slice 4 — gate round 2 (2026-08-29)

- 2026-08-29 — reviewer tenancy: **PASS** (Ready/A). Verified the class predicate is genuinely in the SQL WHERE clause (not a post-page filter), the JS filters are gone, the new regression test exercises the named starvation shape against real SQL (PGlite), backward compatibility holds for every other caller (`onboardingInputs()` with no class arg still returns the full corpus), and typecheck/lint/the full adjacent test suites (65 tests) are clean. Round 1's NOTE carried forward, non-blocking.
- 2026-08-29 — reviewer compliance: **PASS** (Ready/A). Verified the corrected reference-panel sentence against `REFERENCE_BARRED_KINDS`/`REFERENCE_QUOTE_MAX_CHARS`, confirmed no new overclaim and no forbidden-word-scan trip (163 onboarding-ui tests green), confirmed `PostContentError`'s false clause is gone with no test coupled to the old string, spot-checked the two "learn" rewords.
- 2026-08-29 — **SLICE 4 CLOSED AT READY. All three applicable Critical-Path gates PASS: billing (Ready/A, round 1), tenancy (Ready/A, round 2), compliance (Ready/A, round 2).** Two rounds total on tenancy and compliance, within the two-round bound — no third round needed. Reviewer spend: 5 agent runs total (3 round-1 + 2 round-2). Report card: `../respin-finish-slice-4-card.md`.
- 2026-08-29 — **residuals, not claimed done:** (a) R14's true browser walk against a real Anthropic call was not performed — the R-3 echo bar is reachable in production only through `inferVoice`'s call to `writeBrainDoc`, which requires the MODEL to echo a reference post, not a creator-editable field; the mechanism is proven instead via direct `writeCapabilities().writeBrainDoc()` integration tests (`reference-echo.test.ts`, `echo.test.ts`), consistent with slice 2b/3's precedent of naming an unperformed live-vendor walk rather than claiming one. (b) The mutation-plantable population (M1–M8) was named but not independently planted and run this session. (c) Round 1's tenancy NOTE (the cross-write bucket-merge scenario) was traced by hand, found sound, but has no dedicated test — left as a recommendation, not a blocker.

## Slice 2b-c — the spend-retention correction (corrective addendum to slice 2b)

- 2026-08-30 — started (dependency gate: slice 2b proven on disk, closed at Ready — `respin-finish-slice-2b-card.md`). Checkpoint snapshot taken (`Checkpoints: on`): `git stash push --include-untracked -m "claude-jig checkpoint: respin-finish slice 2b-c"` + `git stash apply --index`, tree byte-identical before/after.
- 2026-08-30 — verified against live code (not docs) exactly what slice 2b's card corrections had NOT actually landed: `workspace_spend_monthly` had no `unknown_call_count` column; `costState` was never observed transitioning to `'reconciled'` anywhere in the codebase (no writer existed for R4a at all); the operator route was still `/admin/margin`, not `/admin/model-spend`. `burnPeriodStart`'s Free/paid UTC-period split (R7) was checked and confirmed already correct — left alone.
- 2026-08-30 — **built.** Migration `0017_clumsy_wither.sql` (`unknown_call_count`, backfilled). `upsertSpendRollup` increments it on `costState === 'unknown'`. New `applyReconciliationDelta` (row-locked via `SELECT ... FOR UPDATE`, lock-then-check ordering, branch-specific delta math) plus private `applyRollupDelta` helper. New `ReconciliationTargetError`. Route moved `admin/margin/` → `admin/model-spend/` with a 307 redirect and an "Unpriced calls" column added to the reader.
- 2026-08-30 — least-confident: `applyReconciliationDelta`'s delta math and idempotency mechanism have never been exercised by a real caller — no vendor cost-reconciliation webhook exists in this codebase, so the design (keying on `usageId`, the row-lock shape, the two-branch formula) is validated only against its own tests.
- 2026-08-30 — entry gate PASS, CI shape, Docker live, `TEST_DATABASE_URL` set: typecheck 0, lint 0, `db:check` clean, `next build` clean, **1388/1389 passed, 0 skipped** (the one red is the pre-existing `(marketing)/for/[audience]` gap recorded in slices 2b/3/4's ledger entries, unrelated to this diff). Migration applied cleanly to live dev Postgres.

## Slice 2b-c — gate round 1 (2026-08-30)

- 2026-08-30 — **gate spend announced: 2 reviewers — respin-billing-reviewer, respin-tenancy-reviewer (both Full gates).** Run against the MAIN TREE, not isolated worktrees: this project's own slice-3 ledger entry records that a worktree reviews HEAD, not uncommitted changes, and nothing across slices 1-4 has been committed to this branch — an isolated worktree would have shown each reviewer a stale, near-empty diff. Both briefed with the exact file scope (the files this addendum touched, not the branch's full 187-file uncommitted state) and the least-confident line.
- 2026-08-30 — reviewer tenancy: **PASS** (0 BLOCK, 1 CHANGE, 1 NOTE). All four tenancy-specific checks verified directly (workspace id derived from the locked row not the caller; `requireAdmin()` survives the route move including the redirect; no new cross-tenant read path, confirmed via a planted eslint-boundary probe; no brain/profile scoping touched). The CHANGE — a real race reproduced empirically (1 failure in 7 docker runs, `[true,true]`) in `applyReconciliationDelta`'s concurrent-idempotency test — was explicitly named as a billing-domain money-correctness finding, not a tenancy leak (no live caller, cannot cross workspaces), and did not block this gate's PASS.
- 2026-08-30 — reviewer billing: **NEEDS CHANGES** (0 BLOCK, 1 CHANGE(Medium), 2 NOTE). The CHANGE: a repeat/corrected reconciliation call is silently dropped with no trace — the only place in `spend-rollup.ts` that breaks its own "every assumption gets a KNOWN LIMITATION comment" convention. Both B1 (ledger is the balance) and B3 (debit in-transaction) verified undisturbed; the reviewer independently reproduced R4a's idempotency proof via two live mutation probes (disabled the no-op guard → M9 reddened as predicted; removed `.for("update")` → the docker concurrency test reddened) rather than taking the builder's tests on faith. Two NOTEs: stale `margin-*` test ids after the R14 rename; no rollback/restore note on migration 0017.
- 2026-08-30 — **all findings Medium-or-below on both gates → fixed in this build lane, no second reviewer round.** Race condition root-caused (not assumed): 40 clean local runs first, then direct code inspection confirmed `applyReconciliationDelta`'s own locking was already correct (lock-then-check, no TOCTOU) — the bug was the docker test's JS-flag-plus-fixed-sleep synchronization, which proves ordering in JS but never confirms genuine DB-level contention. Replaced with a `pg_stat_activity`-based lock witness (this repo's own precedent from `activate.docker.test.ts`); a first attempt keyed on `pg_locks.locktype = 'tuple'` was itself empirically wrong (row-lock waiters block on the holder's `transactionid`, not a tuple lock) and caught by its own fix reddening rather than passing. Final version verified **40/40** across two independent 20-run batches. Billing's Medium fixed: `applyReconciliationDelta`'s no-op branch now returns `{ applied: false, priorCostMicroUsd }` instead of a bare `{ applied: false }`, with a docblock `KNOWN LIMITATION` note and a new test proving the mismatch is now detectable. Both NOTEs fixed: `margin-*` test ids renamed to `model-spend-*` throughout; the migration's rollback/restore note appended to `decisions.md`'s R-59 entry (this repo carries no down-migrations and no `.sql`-file prose, so the note goes where this repo's convention already puts such notes).
- 2026-08-30 — entry gate re-run after fixes, CI shape, Docker live: typecheck clean, lint clean, `db:check` clean, **1389/1390 passed, 0 skipped** (same pre-existing unrelated red).
- 2026-08-30 — **SLICE 2b-c CLOSED AT READY. Both Full-gates Critical Paths PASS: billing (PASS, fixed without re-review), tenancy (PASS, round 1).** One round on each gate — well within the two-round bound. Reviewer spend: 2 agent runs total. Report card: `../respin-finish-slice-2b-c-card.md`.
- 2026-08-30 — **residuals, not claimed done:** (a) the two "can…" browser walks against a real Anthropic call were not repeated this session — already an accepted slice-2b residual, unchanged by this addendum's scope. (b) `applyReconciliationDelta`'s delta math and idempotency contract remain validated only against this implementation's own tests — no real reconciliation integration exists yet to validate the payload-shape assumption against. (c) The Fix-1 return shape (`priorCostMicroUsd`) makes a corrected-price mismatch detectable, not enforced — nothing today actually diffs it, since no caller exists yet.

## Slice 3b — Interview + complete Creator Brain

- 2026-08-30 — started (dependency gate: slice 3 proven on disk, closed at Ready). Checkpoint snapshot taken (`Checkpoints: on`): `git stash push --include-untracked -m "claude-jig checkpoint: respin-finish slice 3b"` + `git stash apply --index`, tree byte-identical before/after.
- 2026-08-30 — first build attempt FAILED: "Prompt is too long" (API context-length error) partway through, after a monolithic single-agent build attempt tried to read too much of this codebase's large files (`with-workspace.ts` alone is 2000+ lines) in one context. Partial, additive-only schema work survived (`brain-content.ts`'s strategy/killtest widening, `onboarding-schema.ts`'s two new tables) — inspected, found sound, kept rather than discarded.
- 2026-08-30 — **rebuilt as a split, narrowly-scoped multi-stage build** to avoid the same context failure: Stage A (DB layer only — migration, `interview-ops.ts`, `activateBrainDocCoherent`), then Stages B1/B2 in parallel (interview UI, brain UI — disjoint file surfaces). Each stage briefed with specific line-range pointers into large files rather than "read this whole file."
- 2026-08-30 — Stage A complete: migration `0018_heavy_miracleman.sql`, `interview-ops.ts` (draft save/resume/submit, deterministic — no vendor call), `activateBrainDocCoherent` in `with-workspace.ts`. Entry gate: 1416/1417, 0 skipped. Concurrency proof (two racing `activateBrainDocCoherent` calls) verified stable across 4 docker runs using the `pg_locks` witness pattern.
- 2026-08-30 — Stages B1 (interview UI) and B2 (brain UI) complete in parallel, touching disjoint surfaces (`app/(product)/onboarding/interview/**` vs `app/(product)/brain/**`) plus a shared `app-server.ts` binding addition each — confirmed no merge conflict. B1: 67 new tests. B2: 63+20+25 tests. Combined entry gate: typecheck 0, lint 0, 1510/1511, `next build` clean (`/onboarding/interview` and `/brain` both compile).
- 2026-08-30 — **real browser walk** (dev server, no live Anthropic key needed — this slice's Strategy/Kill Test path is deterministic): empty profile → 11-field interview → review screen → submit → confirm all 8 Strategy claims → coherent activate → "In force now." Found and fixed a real gap during the walk: list fields (goals/ambitions/bannedWords/bannedVibes) had no way to express "decided, zero items" distinct from "not decided" — a genuine R1 violation Stage B1's own report had flagged as a known limitation, not yet fixed. Added the third checkbox ("None — I've decided there are none"), the `explicitlyEmptyFieldName` wire-precedence logic, and 5 new tests (72 total in `onboarding-interview-ui.test.tsx`).
- 2026-08-30 — the walk then surfaced what LOOKED like a second bug: with the new "None" checkbox exercised for `bannedWords` and nothing else touched in `killtest`, the Kill Test document silently failed to appear. Investigated rather than assumed: `buildDocContents`'s `evidence.length > 0` gate was correct — `writeBrainDoc` has its own independent REQ-B02 refusal for "a version in which nothing at all is cited," and a decided-empty-only killtest target genuinely has zero real citations anywhere (an empty array and a `[CHECK]` are both "nothing to cite"). A first "fix" (gate on "was any field touched" instead) was tried, found to make things WORSE — it lets the vacuous write reach `writeBrainDoc`'s refusal from inside the atomic transaction, crashing the WHOLE submission including any real sibling answers — and was reverted, with the reasoning permanently recorded in `interview-ops.ts`'s header so it is not re-tried. A corrected regression test pins the actual right behaviour (silent skip, no crash) instead.
- 2026-08-30 — entry gate PASS after the R1 fix and the vacuous-document investigation, CI shape, Docker live: typecheck 0, lint 0, `db:check` clean, **1515–1521/1516–1522 across several runs, 0 skipped** (the one red consistently the pre-existing `(marketing)/for/[audience]` gap; one run additionally showed a known, previously-documented `__cage_probe.ts` parallel-test-run race — reproduced 0/1 on isolated re-run and 0/1 on a second full-suite re-run, confirmed flaky infra, not a regression).
- 2026-08-30 — **independent mutation-planting pass** (a fresh agent, not the builder): all 6 of the phase card's mutations (M2/M6 adapted to the real implementation, with reasoning recorded — M2's literal "no Kill Test" wording doesn't correspond to a defect since Kill Test is legitimately optional; M6's "inference refuses" doesn't apply since this slice's `submitInterview` has no vendor call at all) planted one at a time, confirmed reddening the predicted test, reverted, confirmed green — sequentially, never two at once. Plus a fresh adversarial read (not mutation-planting) found a real gap: `saveInterviewDraft` had no advisory lock while every sibling brain write does.
- 2026-08-30 — **fixed the missing lock**: `saveInterviewDraft` now takes the same `brain:{workspace}:{profile}` `pg_advisory_xact_lock` as `submitInterview`/`writeBrainDoc`/`confirmBrainDocFields`/`activateBrainDoc`, first statement in its transaction. New `interview-ops.docker.test.ts` proves it on real Postgres using the `pg_locks`-witness pattern (not JS timing) — verified as a genuine, non-vacuous witness by removing the lock and confirming the test reddens with a real unique-constraint race, then restoring and confirming green.

## Slice 3b — gate round 1 (2026-08-30)

- 2026-08-30 — **gate spend announced: 3 reviewers — respin-billing-reviewer (collateral-risk check, Full gates — `with-workspace.ts` is shared with money-critical code though nothing here spends credits), respin-tenancy-reviewer (primary path, Full gates), one merged lean run covering respin-spin-compliance + respin-learning-honesty (both lean-eligible this time, unlike slice 4 which had only one and ran it solo — kill-test content and the declared north-star metric are both newly created by this slice).** All briefed with the exact file scope and run against the main tree (established this session's own precedent: a worktree reviews HEAD, not uncommitted changes, and nothing on this branch is committed).
- 2026-08-30 — reviewer billing: **PASS** (zero findings). Confirmed no credit_ledger/model_usage/billing-table touch anywhere in scope; confirmed `recordModelUsage`'s transaction composition byte-for-byte unchanged; confirmed the new `saveInterviewDraft` lock is key-identical to its four siblings and shares no lock with the money path (no deadlock risk); confirmed `activateBrainDocCoherent`'s atomicity via the real-Postgres concurrency test.
- 2026-08-30 — reviewer compliance+learning (merged lean run): **compliance PASS** (1 Info — the vacuous-document empty-state nuance, already deliberately reasoned and tested, not a rule violation); **learning honesty PASS** (zero findings — L5's declared-metric foundation verified sound: `direction` never silently defaulted, `brain_activation_snapshots` genuinely append-only with no UPDATE path anywhere, confirmed via `tests/table-writers.test.ts`'s sole-writer registry).
- 2026-08-30 — reviewer tenancy: **NEEDS CHANGES** (0 BLOCK · 2 CHANGE). Finding 1: `brainActivationSnapshots`' docblock overstated referential integrity a bare FK doesn't actually provide (no FK exists in the migration). Finding 2: the vacuous-document empty state (compliance's Info note, above) elevated to a real tenancy-relevant creator-facing dead end — a deliberate "no banned words" answer becomes silently and permanently indistinguishable from never having answered, with no recovery path (R11 permanently bars resubmission).
- 2026-08-30 — **both findings fixed in this build lane.** Finding 1: corrected the comment to state plainly no FK exists and why one was deliberately rejected (a per-doc-id FK would race the table's own profile cascade — `cascade` would wrongly delete the whole four-kind snapshot over one kind's doc, `set null` adds an untested second delete path for no benefit) rather than adding a live but hazardous FK. Finding 2: `/brain` now reads the submitted interview draft as a courtesy (never blocks the page on failure) and shows a distinct, honest "you answered — nothing to draft" sentence instead of "complete the interview" when a target was genuinely touched but produced no citable document; 4 new tests prove no cross-target or cross-kind leakage.
- 2026-08-30 — entry gate re-run after fixes, CI shape, Docker live: typecheck 0, lint 0, `db:check` clean, **1521/1522, 0 skipped** (same pre-existing unrelated red, confirmed stable).

## Slice 3b — gate round 2 (2026-08-30, tenancy only — scoped re-run)

- 2026-08-30 — reviewer tenancy: **PASS** (Ready/A). Both fixes independently re-verified against the actual migration/code, not the prose: confirmed the migration truly carries no FK on the four doc-id columns; confirmed zero production `.delete()` calls on `brain_docs` anywhere in the package (substantiating the "never deleted except by profile cascade" claim); confirmed `getInterviewDraft`'s new call site changes no tenancy exposure (it already had no role gate, reused not widened); ran the 4 new tests directly (67/67) and confirmed they are non-vacuous.
- 2026-08-30 — **SLICE 3B CLOSED AT READY. All four applicable Critical-Path gates PASS: billing (Ready/A, round 1), tenancy (Ready/A, round 2), compliance (Ready/A, round 1), learning honesty (Ready/A, round 1).** One round on tenancy — well within the two-round bound. Reviewer spend: 4 agent runs total (3 round 1 + 1 scoped round 2). Report card: `../respin-finish-slice-3b-card.md`.
- 2026-08-30 — **residuals, not claimed done:** `getInterviewDraft`'s own dedicated cross-workspace test not written (mechanism proven by every sibling's identical pattern instead, tenancy reviewer's own low-risk note). The M1-M6 mutation matrix's M2/M6 adaptations are this session's own judgment call, not a literal reading of the card.

## Slice 5 — Brain editing, versions, export

- 2026-08-30 — started (dependency gate: slice 3b proven on disk, closed at Ready in `../respin-finish-slice-3b-card.md`; slice 4 is also closed at Ready and supplies the live R-3 write refusal handed to this slice).
- 2026-08-30 — checkpoint snapshot created and restored as `claude-jig checkpoint: respin-finish slice 5`; stash/current path-and-status parity verified across 397 paths after re-apply. The first verification wrapper used a SHA-256 API absent from this PowerShell runtime; Git itself succeeded and a compatible comparison confirmed parity before implementation.
- 2026-08-30 -- implementer `respin-engineer` (Slice 5 Stage A/B recovery): **complete.** Existing partial implementation recovered and closed through 7 focused files / 172 tests, direct root plus package TypeScript checks, and Slice 5 lint; the adversarial follow-up then found and test-first fixed R1's omitted `updatedAt` contract (112/112 focused tests green).
- 2026-08-30 -- least-confident: the streamed export's cancellation and transaction cleanup under a real browser plus real Postgres is the implemented behaviour most likely to fail first; iterator tests are green, but that browser path remains unwalked.
- 2026-08-30 -- entry-gate **FAIL** (pre-review integration run): typecheck clean across root/auth/config/credits/db/llm, lint clean, `db:check` clean; full Vitest **1617/1619 passed**. New source-scan failure in untracked `safe-log.ts` fixed immediately and its 25 focused witnesses now pass; the real-Postgres inference-race assertion failed only under the full parallel run and passed 10/10 on isolated re-run. Gate remains FAIL until the stable integrated tree is rerun in CI shape.
