# Launch remediation L4 — saved recording pack

Phase: L4 of [launch remediation](../../plans/respin-launch-remediation-master-plan.md#l4--saved-recording-pack). Programme ledger: [creator-ready ledger](ledger.md). Date: 2026-10-04. Depends on [L1](L1-card.md) and [L2](L2-card.md), both Ready/A. Built after [L3](L3-card.md) (Ready/A), in series rather than in parallel. Implementer defaults: `docs/initial/decisions.md` R-153 and its L4-gate amendment.

## Phase L4 — review

**Overall: Ready.** L4 is built, green on my local machine and has passed its reviewer gate.

What it delivers:
- **`/studio/saved/[attemptId]`.** Script, Shooting plan, and Checks/rationale (each creator rule shown as pass or fail with the creator's own wording). It also shows where the version came from and its direct revisions. A saved Spin shows its reference side by side with the similarity-check line.
- **Copy and export.** Copy script, and a Markdown recording pack that keeps every `[check]`, the confirmation item, the weakest point and the product's disclosure sentence. The model's own disclosure advice and its notes are never shown.
- **Use this version.** It costs nothing and refuses a stale write using L2's piece/version token.
- **Three priced revisions** ("Make it shorter", "Sound more natural", "Easier to film").
  - The price shown is checked at the press: a changed price refuses with nothing made and nothing charged.
  - The creator is told when a revision of this version already exists.
  - A Spin revision re-runs the similarity gate against the same stored reference.
- **Reading, copying and exporting cost nothing and call no model.** Zero balance or a pause keeps read rights. Tombstones and membership loss refuse.
- **`/studio`** links every finished draft to its pack and lists the 10 most recent.
- **The sequel checkbox** now also appears on Find concepts and the piece confirmation (L3 deferral BN-2).

Gate history:
- One review batch ran with three reviewers: billing Almost/B, tenancy Almost/B, compliance Almost/B, security Almost/B, accessibility Ready/A.
- No BLOCK or High, so no re-run. All 7 Mediums and every Low were fixed in one batch.
- Each fix was tested by planting the mutation it guards and seeing the test go red (§3).

"Ready" means ready on my local machine only. Nothing was released, committed or pushed, and no paid model was run. The paid browser walk (generate → revise → select → reopen/export) is written in `e2e/journeys/recording-pack.spec.ts`. It is skipped, with a reason, until L6 LA-2 (E-27, H-2 option C).

| Gate | Result | One line |
|------|--------|----------|
| Validation (typecheck/lint/test) | green | Run by the orchestrator on the final tree (`L4-final.sha256`, 43 files, digest `78cac88d2401`). `preflight`, `typecheck`, `worker:typecheck`, `lint`, `db:check` and `build` each exit 0. `TEST_DATABASE_URL=… pnpm -C respin test` exit 0: 254 files, 6,332 passed, 18 skipped, all in `journeys-workflow-triggers.test.ts`; the Docker suites ran live. `playwright test --config playwright.l2.config.ts` exit 0: 2 passed (`free-concept`, `saved-pack`). |
| Respin billing & credits (`respin-billing-reviewer`, separate) | Ready A (after Medium/Low batch-fix) | [Almost B](L4-billing.md); 2 Medium + 2 Low fixed · 0 open |
| Respin brain tenancy (`respin-tenancy-reviewer`, separate) | Ready A (after Medium/Low batch-fix) | [Almost B](L4-tenancy.md); 1 Medium + 3 Low fixed, 2 of 3 Notes fixed · 0 open |
| Respin spin compliance (merged run) | Ready A (after Medium/Low batch-fix) | [Almost B](L4-merged.md) §A; 3 Medium + 3 Low fixed · 0 open; the `sourceToReel` note was tested and recorded (below) |
| Security (merged run; new route and actions) | Ready A (after Medium/Low batch-fix) | [Almost B](L4-merged.md) §B; 1 Medium + 2 Low fixed · 0 open |
| Accessibility of changed UI (merged run) | Ready A | [PASS A](L4-merged.md) §C; 5 Low fixed · 0 open |
| Acceptance criteria | 10/10 proven, paid walk deferred by amendment | Proof lines below. The paid actual-app walk is L6 LA-2's by E-27; it is moved there, not unproven. |
| Least-confident probe | held, one residual | Build bet: the revision price shown can differ from the price charged. Billing confirmed it (M1), and it is now fixed. A residual remains: the quote compare and `generate`'s config read are two reads (R-153 item 5). Fix-batch bet: the Markdown escaping is proven on escaped bytes only, because no Markdown parser is installed, so no real renderer has been run. |
| Reachability | reached via `/studio` (every finished draft links to its pack; recent list) → `/studio/saved/[attemptId]` | 4 deferred items (below) |
| Fixed without re-review | 7 Medium + 15 Low + 2 Note | Listed below |
| Gate ran | 3 runs · 0 re-runs | Announced: billing, tenancy, merged (compliance + security + accessibility). Learning honesty untouched. |
| Gate intensity | lean | Billing and tenancy separate (Full gates: yes); compliance, security and accessibility merged in one Opus run |

### Acceptance proof (plan L4 Acceptance, as amended by E-27)

All of these pass in the final live-DB suite (exit 0) unless the line says otherwise.

- **AC1 — generate → revise → select → close context → reopen the exact version:**
  - `saved-generation.test.ts` "GENERATE -> REVISE -> SELECT -> REOPEN…", on both PGlite and real Postgres.
  - `saved-pack-action.docker.test.tsx` "commission -> revise -> use this version -> reopen…": real actions and the real page on real Postgres, with the transport fake.
- **AC2 — zero new provider calls and zero ledger debits on read, copy and export:**
  - The read takes no provider at all.
  - Ledger, usage and claim row counts are compared before and after.
  - The docker test counts fake-transport calls across two page renders plus the copy and export builders.
- **AC3 — legacy and new outputs:** "LEGACY AND NEW OUTPUTS…" and studio-ui "a LEGACY draft…".
- **AC4 — wrong-scope refusal:**
  - "WRONG SCOPE…" (sibling profile and other workspace).
  - creative-work "CROSS-PROFILE…".
  - isolation "saved recording packs: A's read, selection, revision and recent list never reach B's".
  - "SEATS ON THE SAVED PATH…" (viewer reads; a viewer's select and revise are refused with no rows; an editor's select lands).
- **AC5 — correct checks and disclosure:**
  - "THE MODEL'S DISCLOSURE NEVER LEAVES THE PACKAGE, NOR A MODEL NOTE QUOTING IT…".
  - The docker test plants a note quoting the fake model's disclosure; it is absent from the HTML, the script, the Markdown and the DTO.
  - studio-ui "the MARKDOWN EXPORT and the COPIED SCRIPT…", "B1/B3 MARKDOWN, EVERY SHAPE PLANTED…", "A2 A REOPENED SPIN…", "A6…".
- **AC6 — stale selection rejected:** "STALE SELECTION…", creative-work "'use this version'…", and the docker `?e=creative_piece_stale` redirect. A crafted `?selected=1` link no longer shows a false success (B2).
- **AC7 — keyboard, focus, loading, error:** studio-ui "LOADING, RESULT AND ERROR states…" and "C1 / C2…". The browser half is `e2e/l2/saved-pack.spec.ts`: keyboard copy and download, both widths, reopening after a fresh sign-in. That run is `playwright.l2.config.ts` (2 passed).
- **AC8 — mobile and desktop from one stored version:** studio-ui "MOBILE AND DESKTOP…". In the browser, the panels stack at 390px and sit side by side at 1280px.
- **AC9 — revision cost and parent disclosed before submit, price bound:**
  - studio-ui "the REVISE presses disclose…" and "M1 THE QUOTE TRAVELS…".
  - "M1 THE QUOTE IS BOUND…", on both backends: a changed price refuses with zero claims, ledger rows, usage rows and provider calls.
  - "M2 A VERSION'S OWN REVISIONS…".
- **AC10 — missing, corrupt or unsupported history gets an honest error that spends nothing; read rights kept at zero balance and under pause; tombstones and membership loss refuse:**
  - "MISSING, PENDING, NOT STORED, UNSUPPORTED AND CORRUPT…".
  - "ZERO BALANCE AND A PAUSE KEEP READ RIGHTS…".
  - `pause-authority.test.tsx` "THE POPULATION IS FOUND, NOT ASSUMED…".
- **BN-2 (routed from L3):** studio-ui "BN-2: 'Find concepts' and the piece confirmation carry the SEQUEL box…".
- **Deferred by amendment E-27:** the paid browser walk in `e2e/journeys/recording-pack.spec.ts`. It is skipped with a reason naming L6 LA-2 and F-01, and `journey-settled-waits.test.ts` asserts that skip.

### Fixed without re-review (§3)

Every item has a test that its planted mutation turned red (plants p1–p18 plus a planted unlisted page; files restored and sha256-verified).

- **Billing M1 and compliance A5:** the quote config version travels as a hidden `quote` field. `reviseSaved` refuses a missing or malformed version, and throws `GenerationQuoteChangedError` before `generate` when the price differs. The copy reads "currently costs" and the page uses its own copy for the quote-changed refusal.
- **Billing M2:** `directRevisionsInScope` lists each version's own revisions in every mode. A "You already made a revision…" line with a link sits above the presses. The replayed-branch comment is now honest. The per-press id is kept (R-153 item 4).
- **Billing Lows:**
  - An unreadable price offers no press.
  - Spin presses are now real (see A3).
- **Tenancy M:**
  - `PAUSE_COURTESY_PAGES` gains the saved page.
  - A scan now holds every `app/(product)` page that asks about a pause equal to the list. It found `/results`, missing since before L4, which is now listed.
- **Tenancy Lows:**
  - The isolation reason now names its config and reference reads.
  - New seats test.
  - The `replayChargeSentence` docstring is back in place.
- **Compliance A1:** creator-rule verdicts carry pass/fail plus the creator's own rule text (`killtestContentInScope`). The model note is dropped, decided by ownership. The header claim is corrected.
- **Compliance A2:**
  - `spinReferenceSummaryForProfile` (`trends-storage.ts`) is profile-scoped, under the same rights predicate as before.
  - The reference panel, the similarity line and the export attribution are added.
  - `sourceToReel` shows its root source, capped at 2,000 characters.
  - `ORIGINAL_NOTE` now reads "Not a revision of another version."
- **Compliance A3:** `reviseSaved` passes the parent's stored `spinAutopsyId`, never one from the form. A missing or unreadable reference offers no press.
- **Compliance A4 and A6:**
  - The "exactly as it was saved" sentences are reworded.
  - A refusal now says when withheld disclosure advice broke a hard rule.
- **Security B1 and B3:** `md()` collapses each value to one line and escapes the inline and reference-definition syntax. It also neutralises line-start markers and bare URL or email autolinks. The comment is corrected.
- **Security B2:** `selectedStatus` requires the read to show the version is selected.
- **Accessibility C1–C5:**
  - Copy failures name the correct box, and the script has its own box.
  - A repeated press is announced again (clear, then set).
  - Version links carry an ordinal.
  - `RecentPacks` is a labelled section.
  - The client files use `--sp-*` spacing tokens.
- **Notes:**
  - The lineage walk is now at most 64 reads, matching R-153.
  - A piece's versions are held to `ideaToScript`.
- **Found while testing:** the saved page crashed for a creator with no Kill Test document (`creatorRulesOfContent(null)`). It now fails honestly, and the docker test covers it.

### Deferred (owed elsewhere)

1. **Paid browser walk:** goes to L6 LA-2 (E-27, F-01).
2. **`sourceToReel` revision check reads the parent draft, not the root source** (`checkSourceFidelity`, eight-word runs). A revision that keeps eight words of its parent in a row is refused as `summarised_source`, and the creator is charged. The saved page offers no `sourceToReel` revision press. Studio's own revise path is unchanged. Goes to L5 (R-153 amendment).
3. **Quote binding residual:** the compare and `generate`'s config read are two reads. Studio's main revise form sends no quote. Goes to L5's offer work.
4. **Model disclosure (audit P1-R1) on the live `/studio` result panel and `/trends`:** goes to L5/L6. `mode-checks.ts:1199` still says "L4's export presenter must", which is now stale.

**Top things to fix (in order):**
1. `respin/packages/modes/src/mode-checks.ts:272-275`: a `sourceToReel` revision is checked against its parent, not its chain's root source. It can refuse and charge on Studio's main revise path. L5.
2. `respin/app/(product)/studio/saved/recording-pack.ts` `md()`: run one real CommonMark/GFM renderer over the planted shapes (for example in a dev-only test) before the export is relied on outside the creator's own machine. L6.
3. `respin/packages/credits/src/saved-generation.ts` (`reviseSaved`): pass the quoted config version into `generate` so the comparison and the claim read one version. L5.

*Ask `/go` to explain any finding in plain words, or to just fix them.*
