T-2 — Spend ceiling: finish the close
You've set CUTDOWN_SPEND_CEILING_AUD in cutdown/.env. The full close is four steps:

1. Complete the pair. Live mode requires both the ceiling and the credential — gateway.ts reads:


# cutdown/.env  (gitignored — never commit; a leaked key is a rotate-everything incident)
ANTHROPIC_API_KEY=sk-ant-...
CUTDOWN_SPEND_CEILING_AUD=200          # you've done this one
# optional overrides (defaults shown):
# CUTDOWN_EDITORIAL_MODEL_ID=claude-sonnet-5
# CUTDOWN_MODEL_TIMEOUT_SECONDS=60
Without the key, every editorial stage silently keeps taking the skip/recorded path — the ceiling alone changes nothing.

2. Earn PHASE_3_ACCEPTED_LIVE — this is the real payload of T-2. Per cutdown-phase-3.md, only one thing earns it: cutdown test:models --live run against a real indexed job (recorded fixtures can never satisfy it, D-27). Your schwarzkopf job is real and indexed, so:


cd cutdown
node apps/cli/dist/src/main.js test:models --live --job schwarzkopf-w1-showcase
It skips cleanly if the gateway is unconfigured — a skip means step 1 is incomplete, not success. Capture the full output; tech-spec §231 says the recorded output is required evidence.

3. The paper trail (an engineering session does this through the normal gates — it's in the handoff prompt): append a D-row to decisions.md recording the ceiling value and its home (cutdown/.env), retire T-2 from todos.md, update cutdown-master-plan.md:98's "Owner-blocked" line, and record PHASE_3_ACCEPTED_LIVE with the step-2 evidence.

4. What this unblocks: all of Stage 3's live editorial execution, Stage 1's live provider benchmarks — and, practically for T-4, your new outputs can now be cut by live editorial judgement instead of recorded replies, which PHASE_0_EXIT_EARNED ultimately requires anyway (D-38).

T-3 — Two more accounts with rights records
1. Choose two stable accountIds. D-36: owner-issued, never derived from a display name. Follow the existing shape: acct-schwarzkopf-extracare-au-w1 → e.g. acct-<brand>-<campaign>-<market>-<wave>. The id enters through the JobBrief and must be byte-identical on every job for that account.

2. Gather the rights facts per asset. The resolved record (rights-record-v1.json) carries 15 required fields; you declare the underlying facts and ingest derives state from them plus the clock:

You declare	Notes
owner, supplier	who owns / who supplied
permittedPlatforms	e.g. [tiktok] — empty array means explicitly none
territories	ISO codes, e.g. [AU]
campaignStart, campaignEnd, expiryDate	expiry is a non-waivable packaging blocker — an expired asset can never be packaged
talentReleaseStatus, locationReleaseStatus, musicStatus	enum values
editingPermitted	null is treated as "no" by the packaging gate — declare it explicitly true
paidAmplificationPermitted	false is fine for Phase 0 (organic only); never conflate with editing permission
evidenceUri	a claim of cleared with no evidence URI is not a grant. Link the release/licence/contract. T-5 caveat: partnership-post links = delegated authority, internal-showcase only
notes	free text
3. Write the rights manifest — a YAML mapping of relative path → record (rights.ts:119). Keys must match the ingested files' normalized relative paths exactly — an unknown key is rejected as a typo, not ignored:


# rights-brandx.yaml
clip-01.mp4:
  owner: "BrandX Pty Ltd"
  supplier: "Social Soup"
  permittedPlatforms: [tiktok]
  territories: [AU]
  campaignStart: "2026-08-01"
  campaignEnd: "2026-12-31"
  expiryDate: "2026-12-31"
  talentReleaseStatus: obtained
  locationReleaseStatus: not_required
  musicStatus: none
  editingPermitted: true
  paidAmplificationPermitted: false
  evidenceUri: "https://…/signed-release-or-licence"
  notes: "Creator agreement held by campaign; see evidence link."
clip-02.mp4:
  # …one entry per file
4. Brief + ingest (ingest is atomic — commits only if every asset validates):


node apps/cli/dist/src/main.js brief brandx-w1 --file brief-brandx.yaml   # JobBrief carries the accountId
node apps/cli/dist/src/main.js ingest ./footage/brandx --job brandx-w1 --rights-manifest rights-brandx.yaml
The JobBrief's required fields (job-brief-v1.json): accountId, audience, objective, platforms, distributionMode, durationRange, locale, brandOrCampaign, contentPromise, cta, variantCount.

5. Know when T-3 is actually closed: criterion 1 counts accounts from resolved outputs — so each new account needs at least one approved, packaged output before status --phase0 shows 2/3 then 3/3. Supplying footage+rights is the owner half; the first output on each account (T-4 work) completes it.

T-4 — The 19 remaining outputs
Before the first output: commit and push 0B-3. The bump must be landed before accumulation resumes (the whole point of this stage), and the push finally gives you a CI run to read — closing A7 costs one look at the Actions page.

1. The counting unit (D-56): one output = one approved cut per distinct CreativeBrief. propose --variants N yields N briefs from one job's footage — each can become one countable output. Re-renders and repackages of the same brief add zero. Roughly: 4–5 jobs × 4–5 approved variants ≈ the 19 you need, spread so each of the 3 accounts has ≥1.

2. Per-output command chain (per job: brief/ingest/index once; then per variant):


cd cutdown
node apps/cli/dist/src/main.js index <job> --asset <asset-id>        # per asset; --skip ocr saves ~90% of index cost, recorded in the ledger
node apps/cli/dist/src/main.js propose <job> --variants 5            # omit --recorded-model → LIVE now that T-2 is set
node apps/cli/dist/src/main.js plan <creative-brief-id> --platform tiktok
node apps/cli/dist/src/main.js validate <platform-edl-id>            # deterministic gate + advisory critic; 'fail' is a result, not an error
node apps/cli/dist/src/main.js render <platform-edl-id> --tier draft
# → a human WATCHES the draft, then:
node apps/cli/dist/src/main.js approve <draft-render-id> --by "Fred Wang"     # the human act — nothing else authorises a final
#   (or --reject --reason "…" → cutdown revise <render-id> --notes "…" → re-render draft → re-approve)
node apps/cli/dist/src/main.js render <platform-edl-id> --tier final --approved-draft <manifest-id>
node apps/cli/dist/src/main.js package <final-render-id>
node apps/cli/dist/src/main.js status --phase0                       # watch criterion 1 climb
cutdown run <job> can drive the state machine through the non-interactive stages for you; approval always stays manual (D-9 — no auto-approval path exists).

3. What status --phase0 will do — expected, don't "fix" it:

Your first post-bump package flips criterion 3 to [ ] not met, naming render-v2.json v1→v2. That is 0B-1's detection machinery firing on the deliberate bump — correct behaviour. It self-heals at the 11th resolved output and costs zero schedule against the 20.
pass_with_waivers outputs count, but are reported separately (D-35) — keep waivers for warnings only; blockers and expired rights are non-waivable and package will refuse.
Criterion 1 reads N/20 across M/3 accounts; done means 20/20 across 3/3 — at which point criteria 2 and 4 ride along on the packaging gate's own evidence, and criterion 3 goes green once the last 10 outputs are post-bump.
One honesty note for the record you'll eventually show stakeholders: the counting policy (§ "real ≠ live") separates real footage from live editorial judgement. Outputs produced after T-2's close with live inference are the strongest evidence; if any early T-4 outputs run on recorded replies, that's legal for the count but worth noting per-job in the ledger.