// Brain helpers shared by the journeys: activating a drafted brain section on
// /brain, and the ONE voice-build press with its included-build evidence.
//
// THE EVIDENCE READER IS A JOURNEY FIXTURE, NOT A PRODUCT READ PATH. Like
// db-shortcut.ts it shells `docker exec respin-postgres psql` rather than
// importing `@respin/db` — the app's tenancy default-deny exists to keep raw
// tables behind the scoping helper, and a package import here would be a
// second, ungoverned entrypoint. It differs from db-shortcut.ts in two ways
// the tenancy review asked for: SQL goes in on STDIN inside a READ ONLY
// transaction (never `-c`), and the two caller values reach it as psql
// variables interpolated with `:'name'` quoting, never spliced into the text.
// It returns attempt ids, usage outcome/consumption flags and claim identity
// only — never prompt or response text, credentials or the raw usage JSON.
import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import {
  currentRunId,
  writeConsumptionRecord,
  type ConsumptionRecord,
  type JourneyArtifacts,
  type PressOutcome,
  type VoicePressPersona,
} from "./artifacts";

/** Mirrors `ONBOARDING_BRAIN_PURPOSE` in packages/credits/src/inference.ts (e2e never imports product packages). */
export const ONBOARDING_BRAIN_PURPOSE = "onboarding_brain";

/**
 * The ONLY refusal codes a voice press retries, once. On the voice path both
 * come from `RunSlotBusyError` (packages/credits/src/inference.ts) BEFORE the
 * vendor call, the included-build claim and any debit, so a re-press reaches a
 * fresh vendor call. Everything else — a kind-bearing assembly refusal, a
 * post-vendor `LlmError` with no kind, `workspace_paused` (also produced after
 * the claim by `writeBrainDoc` and `debitCredits`) — is recorded and NOT
 * retried: the included build may already be claimed, and a Free re-press
 * would be refused by the balance gate with no kind at all.
 */
export const PRE_VENDOR_RETRY_CODES = ["run_slot_busy", "server_at_capacity"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Ticks every confirm checkbox in a brain section, records, then activates. */
export async function activateBrainSection(
  page: Page,
  prefix: "voice" | "strategy" | "killtest"
): Promise<void> {
  const section = page.getByTestId(`${prefix}-section`);
  const empty = await section.getByTestId(`${prefix}-empty`).isVisible().catch(() => false);
  if (empty) return; // nothing was drafted for this kind (e.g. interview left it untouched).
  const checkboxes = section.locator('input[type="checkbox"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i += 1) {
    await checkboxes.nth(i).check();
  }
  const recordButton = section.getByRole("button", { name: "Record my decisions" });
  if (await recordButton.isVisible().catch(() => false)) {
    await recordButton.click();
    // `/brain`'s confirm submit is a SAME-ROUTE server-action redirect (a
    // soft client-side navigation), so `waitForURL("**/brain")` resolves
    // instantly without the confirmed-state re-render ever happening - the
    // exact race that silently left every onboarding post half-saved
    // earlier in this journey. Wait for the real completion signal instead:
    // the Activate button appearing (or staying absent for a real reason).
    await Promise.race([
      section.getByRole("button", { name: "Activate my Creator Brain" }).waitFor({ state: "visible", timeout: 20_000 }),
      section.getByTestId(`${prefix}-decide-blocked`).waitFor({ state: "visible", timeout: 20_000 }),
    ]).catch(() => undefined);
  }
  const activateButton = section.getByRole("button", { name: "Activate my Creator Brain" });
  if (await activateButton.isVisible().catch(() => false)) {
    await activateButton.click();
    await section.getByTestId(`${prefix}-active-meta`).waitFor({ state: "visible", timeout: 20_000 });
  }
}

// ---------------------------------------------------------------------------
// Included-build evidence: read-only snapshots around a press.
// ---------------------------------------------------------------------------

export type UsageRow = { attemptId: string; outcome: string; consumed: boolean };

export type EvidenceSnapshot = {
  workspaceId: string;
  /** attempt ids in `first_billable_attempts` for (workspace, profile, onboarding_brain) */
  claims: string[];
  /** `model_usage` rows for the same scope — metering identity and flags only */
  usage: UsageRow[];
};

/** Runs a command with stdin; injectable so the unit test never spawns. */
export type CommandRunner = (file: string, args: readonly string[], input: string) => string;

const dockerPsql: CommandRunner = (file, args, input) =>
  execFileSync(file, [...args], { input, stdio: ["pipe", "pipe", "pipe"] }).toString("utf8");

/**
 * The evidence query. One READ ONLY transaction, stdin, psql variables. The
 * scope is resolved from the OWNER MEMBERSHIP of the synthetic email AND the
 * selected profile living in that workspace; anything but exactly one such
 * workspace is a refusal, never a guess.
 */
export const EVIDENCE_SQL = `
BEGIN READ ONLY;
WITH ws AS (
  SELECT m.workspace_id AS id
  FROM memberships m
  JOIN users u ON u.id = m.user_id
  JOIN "user" au ON au.id = u.auth_user_id
  WHERE au.email = :'email'
    AND m.role = 'owner'
    AND EXISTS (
      SELECT 1 FROM creator_profiles cp
      WHERE cp.id = :'profile'::uuid AND cp.workspace_id = m.workspace_id
    )
)
SELECT json_build_object(
  'workspaces', (SELECT coalesce(json_agg(ws.id), '[]'::json) FROM ws),
  'claims', (
    SELECT coalesce(json_agg(f.attempt_id), '[]'::json)
    FROM first_billable_attempts f, ws
    WHERE f.workspace_id = ws.id AND f.profile_id = :'profile'::uuid AND f.purpose = :'purpose'
  ),
  'usage', (
    SELECT coalesce(json_agg(json_build_object(
      'attemptId', mu.attempt_id, 'outcome', mu.outcome, 'consumed', mu.consumed_included_build
    )), '[]'::json)
    FROM model_usage mu, ws
    WHERE mu.workspace_id = ws.id AND mu.profile_id = :'profile'::uuid AND mu.purpose = :'purpose'
  )
);
COMMIT;
`;

export function evidenceArgs(ownerEmail: string, profileId: string): readonly string[] {
  return [
    "exec",
    "-i",
    "respin-postgres",
    "psql",
    "-U",
    "respin",
    "-d",
    "respin",
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    `email=${ownerEmail}`,
    "-v",
    `profile=${profileId}`,
    "-v",
    `purpose=${ONBOARDING_BRAIN_PURPOSE}`,
    "-At",
    "-q",
    "-f",
    "-",
  ];
}

export function readIncludedBuildEvidence(
  ownerEmail: string,
  profileId: string,
  run: CommandRunner = dockerPsql
): EvidenceSnapshot {
  if (!EMAIL.test(ownerEmail)) {
    throw new Error(`refusing to pass an unexpected email shape to psql: ${ownerEmail}`);
  }
  if (!isUuid(profileId)) {
    throw new Error(`refusing to pass a non-UUID profile id to psql: ${profileId}`);
  }
  const out = run("docker", evidenceArgs(ownerEmail, profileId), EVIDENCE_SQL).trim();
  // `-At -q` prints one JSON line for the SELECT; BEGIN/COMMIT print nothing under -q.
  const line = out.split(/\r?\n/).find((l) => l.startsWith("{"));
  if (!line) throw new Error("included-build evidence query returned no JSON row");
  const parsed = JSON.parse(line) as {
    workspaces: unknown;
    claims: unknown;
    usage: unknown;
  };
  const workspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
  if (workspaces.length !== 1 || !isUuid(workspaces[0])) {
    throw new Error(
      `included-build evidence: expected exactly one owner workspace for the selected profile, found ${workspaces.length}`
    );
  }
  const claims = Array.isArray(parsed.claims) ? parsed.claims : null;
  const usageRaw = Array.isArray(parsed.usage) ? parsed.usage : null;
  if (!claims || !usageRaw) throw new Error("included-build evidence: malformed claims/usage");
  const usage: UsageRow[] = usageRaw.map((row) => {
    const r = row as Record<string, unknown>;
    if (typeof r.attemptId !== "string" || typeof r.outcome !== "string" || typeof r.consumed !== "boolean") {
      throw new Error("included-build evidence: malformed usage row");
    }
    return { attemptId: r.attemptId, outcome: r.outcome, consumed: r.consumed };
  });
  for (const c of claims) {
    if (typeof c !== "string") throw new Error("included-build evidence: malformed claim");
  }
  return { workspaceId: workspaces[0], claims: claims as string[], usage };
}

// ---------------------------------------------------------------------------
// The pure classifier: what ONE press did to the included build.
// ---------------------------------------------------------------------------

export type PressClassification = {
  attemptId: string | null;
  consumed: boolean | "unknown";
};

/**
 * `consumed: true` ONLY when the before snapshot has no claim and the after
 * snapshot has exactly one new claim whose attempt joins same-scope new usage
 * carrying `consumed_included_build = true`. Code/kind never enter this: the
 * action's refusal code cannot establish whether the claim was written.
 */
export function classifyPress(
  before: EvidenceSnapshot | null,
  after: EvidenceSnapshot | null,
  settled: PressOutcome
): PressClassification {
  if (!before || !after || settled === "unknown") return { attemptId: null, consumed: "unknown" };
  if (before.workspaceId !== after.workspaceId) return { attemptId: null, consumed: "unknown" };

  const beforeAttempts = new Set(before.usage.map((u) => u.attemptId));
  const newUsage = after.usage.filter((u) => !beforeAttempts.has(u.attemptId));
  const newAttempts = [...new Set(newUsage.map((u) => u.attemptId))];
  if (newAttempts.length > 1) return { attemptId: null, consumed: "unknown" };
  const newAttempt = newAttempts[0] ?? null;

  const beforeClaims = new Set(before.claims);
  const newClaims = after.claims.filter((c) => !beforeClaims.has(c));

  if (before.claims.length > 0) {
    // The included build was already claimed before this press; whatever this
    // press did, it did not consume it. A new claim here would be a second row
    // under a unique index — impossible — so anything but zero is a conflict.
    if (newClaims.length !== 0) return { attemptId: null, consumed: "unknown" };
    return { attemptId: newAttempt, consumed: false };
  }

  if (newClaims.length === 0) {
    // A success always writes a usage row (`runInference` records usage before
    // it returns); a settled success with nothing written is a record conflict.
    if (settled === "succeeded" && newAttempt === null) return { attemptId: null, consumed: "unknown" };
    // Pre-vendor refusal (nothing written) or non-consuming usage without a
    // claim (a truncation: the vendor charged us, the entitlement was not spent).
    return { attemptId: newAttempt, consumed: false };
  }
  if (newClaims.length !== 1) return { attemptId: null, consumed: "unknown" };
  const claim = newClaims[0];
  if (newAttempt === null || newAttempt !== claim) {
    // A claim names an attempt this press's usage does not show, or the claim
    // exists with no usage at all — the two records disagree.
    return { attemptId: null, consumed: "unknown" };
  }
  // The product writes a claim only for a usage row that CONSUMED the included
  // build (`recordModelUsage`, with-workspace.ts) — a new claim with no
  // consuming row is a writer conflict, never a truncation, so it is unknown
  // rather than a liberal false that would under-count a consuming refusal.
  const consuming = newUsage.some((u) => u.attemptId === claim && u.consumed);
  return consuming ? { attemptId: claim, consumed: true } : { attemptId: null, consumed: "unknown" };
}

// ---------------------------------------------------------------------------
// The counter over settled records (used by the manifest validator and the
// closing demonstration's reconciliation).
// ---------------------------------------------------------------------------

export type ConsumingRefusalCount =
  | { stop: false; count: number }
  | { stop: true; reason: "unknown-record" | "conflicting-duplicates"; count: number };

/**
 * Distinct `(runId, profileId, attemptId)` with a terminal `refused` outcome and
 * `consumed: true`. Duplicates of one identity count once; duplicates that
 * DISAGREE, or any `unknown`, stop the demonstration for reconciliation.
 */
export function countConsumingRefusals(records: readonly ConsumptionRecord[]): ConsumingRefusalCount {
  const seen = new Map<string, ConsumptionRecord>();
  let unknown = false;
  let conflict = false;
  for (const r of records) {
    if (r.consumed === "unknown" || r.outcome === "unknown") unknown = true;
    if (r.attemptId === null) continue;
    const key = `${r.runId} ${r.profileId} ${r.attemptId}`;
    const prior = seen.get(key);
    if (prior && (prior.outcome !== r.outcome || prior.consumed !== r.consumed)) conflict = true;
    if (!prior) seen.set(key, r);
  }
  let count = 0;
  for (const r of seen.values()) if (r.outcome === "refused" && r.consumed === true) count += 1;
  if (unknown) return { stop: true, reason: "unknown-record", count };
  if (conflict) return { stop: true, reason: "conflicting-duplicates", count };
  return { stop: false, count };
}

// ---------------------------------------------------------------------------
// The retry rule, as a pure function so it has a unit witness.
// ---------------------------------------------------------------------------

export type RetryInput = {
  code: string | null;
  assemblyKind: string | null;
  pressOrdinal: number;
  consumed: boolean | "unknown";
};

/**
 * A second press is allowed ONLY when both halves agree: the refusal code is a
 * pre-vendor run-slot code with no assembly kind (so no vendor call, claim or
 * debit happened by the product's own ordering), AND this press's evidence says
 * nothing was consumed. `unknown` evidence (a snapshot failed to read) never
 * authorises a potentially metered second press on the code alone; a
 * kind-bearing or post-vendor refusal is never retried; there is one retry.
 */
export function retryDecision(input: RetryInput): { retry: boolean; reason: string } {
  const { code, assemblyKind, pressOrdinal, consumed } = input;
  const preVendorCode =
    assemblyKind === null && code !== null && (PRE_VENDOR_RETRY_CODES as readonly string[]).includes(code);
  if (!preVendorCode) {
    return { retry: false, reason: `refused (code=${code ?? "none"}, assemblyKind=${assemblyKind ?? "none"}); not a pre-vendor run-slot refusal, not retried` };
  }
  if (pressOrdinal !== 1) {
    return { retry: false, reason: `refused before the vendor (${code}) on press ${pressOrdinal}; the one retry is spent` };
  }
  if (consumed !== false) {
    return { retry: false, reason: `refused before the vendor (${code}) but its consumption evidence is ${String(consumed)}; NOT retrying on the code alone` };
  }
  return { retry: true, reason: `refused before the vendor (${code}) with consumed=false; retrying once` };
}

// ---------------------------------------------------------------------------
// The press itself.
// ---------------------------------------------------------------------------

export type VoiceBuildResult =
  | { outcome: "succeeded" }
  | { outcome: "refused"; code: string | null; assemblyKind: string | null };

/**
 * Presses "Build my voice brain" on /onboarding for the selected profile and
 * waits for the terminal outcome, bracketing the press with evidence snapshots
 * and writing the structured record (initial `unknown`, then settled) BEFORE
 * any screenshot or retry. Retries once, only on a pre-vendor refusal code.
 * A press that never settles writes `unknown` and throws — a timeout is a
 * failure this journey asserts, not an outcome it records and moves past.
 */
export async function buildVoiceBrain(
  page: Page,
  opts: {
    artifacts: JourneyArtifacts;
    persona: VoicePressPersona;
    ownerEmail: string;
    read?: (ownerEmail: string, profileId: string) => EvidenceSnapshot;
  }
): Promise<VoiceBuildResult> {
  const read = opts.read ?? readIncludedBuildEvidence;
  const runId = currentRunId();
  const profileId = await page.locator('select[name="profileId"]').inputValue();
  if (!isUuid(profileId)) throw new Error(`selected profileId is not a UUID: ${profileId}`);

  for (let pressOrdinal = 1; pressOrdinal <= 2; pressOrdinal += 1) {
    let before: EvidenceSnapshot | null = null;
    try {
      before = read(opts.ownerEmail, profileId);
    } catch (err) {
      opts.artifacts.note(`voice press ${pressOrdinal}: before-snapshot unavailable - ${String(err)}`);
    }
    const initial: ConsumptionRecord = {
      runId,
      persona: opts.persona,
      pressOrdinal,
      profileId,
      attemptId: null,
      outcome: "unknown",
      consumed: "unknown",
    };
    writeConsumptionRecord(initial);

    await page.getByRole("button", { name: "Build my voice brain" }).click();
    // Busy first, then terminal: on a retry the FIRST press's refusal banner is
    // still in the DOM, so "a terminal node is visible" alone would match it.
    const status = page.getByTestId("run-status");
    await status.filter({ hasText: /.+/ }).waitFor({ state: "visible", timeout: 15_000 });
    const terminal = page.locator('[data-testid="run-result"], [data-testid="run-refusal"]').first();
    try {
      // The flight ends when the status region empties again; only THEN is the
      // visible terminal node this press's own and not the previous one's.
      await expect(status).toHaveText("", { timeout: 90_000 });
      await expect(terminal).toBeVisible({ timeout: 15_000 });
    } catch (err) {
      opts.artifacts.note(`voice press ${pressOrdinal}: no terminal outcome within 90 s (record left unknown)`);
      throw err;
    }
    const refusal = page.getByTestId("run-refusal");
    const refused = await refusal.isVisible().catch(() => false);
    const code = refused ? await refusal.getAttribute("data-code") : null;
    const assemblyKind = refused ? await refusal.getAttribute("data-assembly-kind") : null;
    const settled: PressOutcome = refused ? "refused" : "succeeded";

    let after: EvidenceSnapshot | null = null;
    try {
      after = read(opts.ownerEmail, profileId);
    } catch (err) {
      opts.artifacts.note(`voice press ${pressOrdinal}: after-snapshot unavailable - ${String(err)}`);
    }
    const { attemptId, consumed } = classifyPress(before, after, settled);
    const record: ConsumptionRecord = { ...initial, attemptId, outcome: settled, consumed };
    writeConsumptionRecord(record);
    opts.artifacts.note(
      `voice press: ${JSON.stringify({ ...record, code, assemblyKind })}`
    );

    if (!refused) return { outcome: "succeeded" };
    const decision = retryDecision({ code, assemblyKind, pressOrdinal, consumed });
    opts.artifacts.note(`voice press ${pressOrdinal}: ${decision.reason}`);
    if (decision.retry) continue;
    return { outcome: "refused", code, assemblyKind };
  }
  throw new Error("unreachable: voice press loop exited without a result");
}
