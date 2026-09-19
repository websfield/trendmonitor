// creator-ready Phase 2, T2 — the included-build evidence contract (B9-C1),
// failed-dispatch retention (B10-C1) and the alternate-upload witness (B11-C1).
//
// The reader is driven with a MOCKED command runner (nothing spawns here); the
// classifier and counter are pure. The fresh-database journey run is the only
// real integration evidence — these mocks do not earn that proof and say so.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  consumptionRecordPath,
  currentRunId,
  writeConsumptionRecord,
  type ConsumptionRecord,
} from "../e2e/support/artifacts";
import {
  EVIDENCE_SQL,
  ONBOARDING_BRAIN_PURPOSE,
  PRE_VENDOR_RETRY_CODES,
  classifyPress,
  countConsumingRefusals,
  readIncludedBuildEvidence,
  retryDecision,
  type CommandRunner,
  type EvidenceSnapshot,
} from "../e2e/support/brain";
import {
  ConsumptionRejected,
  buildConsumptionManifest,
  writeConsumptionManifest,
} from "../scripts/scan-journey-notes";
import { uploadPathLines, uploadPopulation, workflowText } from "./journeys-upload-population";

const WS = "11111111-1111-4111-8111-111111111111";
const PROFILE = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";
const B = "44444444-4444-4444-8444-444444444444";
const EMAIL = "e2e.owner.1@example.test";

const snap = (claims: string[], usage: EvidenceSnapshot["usage"], workspaceId = WS): EvidenceSnapshot => ({
  workspaceId,
  claims,
  usage,
});
const row = (attemptId: string, consumed: boolean, outcome = "succeeded") => ({ attemptId, outcome, consumed });

const tmpDirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "journey-evidence-"));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("classifyPress — claim/attempt-based, never code/kind", () => {
  it("pre-claim refusal (e.g. workspace_paused before the claim): nothing written -> false, no attempt", () => {
    expect(classifyPress(snap([], []), snap([], []), "refused")).toEqual({ attemptId: null, consumed: false });
  });
  it("post-claim refusal (workspace_paused after the claim): new claim + consuming usage -> true", () => {
    expect(classifyPress(snap([], []), snap([A], [row(A, true)]), "refused")).toEqual({ attemptId: A, consumed: true });
  });
  it("truncation / non-consuming usage WITHOUT a claim -> false; a new claim with no consuming row is a writer conflict -> unknown", () => {
    // Truncation: the vendor charged us, usage is written, no claim (the product
    // writes a claim only for a row that consumed the included build).
    expect(classifyPress(snap([], []), snap([], [row(A, false, "schema_invalid")]), "refused")).toEqual({
      attemptId: A,
      consumed: false,
    });
    // Impossible under the one writer: a claim whose only usage row did not
    // consume. Liberal "false" would under-count a consuming refusal — unknown.
    expect(classifyPress(snap([], []), snap([A], [row(A, false, "schema_invalid")]), "refused")).toEqual({
      attemptId: null,
      consumed: "unknown",
    });
    // A settled success that wrote nothing is the same class of conflict.
    expect(classifyPress(snap([], []), snap([], []), "succeeded")).toEqual({ attemptId: null, consumed: "unknown" });
  });
  it("post-parse failure: action refused but usage outcome `succeeded` and a new claim -> true", () => {
    expect(classifyPress(snap([], []), snap([A], [row(A, true, "succeeded")]), "refused")).toEqual({
      attemptId: A,
      consumed: true,
    });
  });
  it("duplicate usage rows for one attempt count once", () => {
    expect(classifyPress(snap([], []), snap([A], [row(A, true), row(A, true)]), "refused")).toEqual({
      attemptId: A,
      consumed: true,
    });
  });
  it("a pre-existing claim means this press did not consume; its attempt is not reused as identity", () => {
    expect(classifyPress(snap([A], [row(A, true)]), snap([A], [row(A, true), row(B, false)]), "refused")).toEqual({
      attemptId: B,
      consumed: false,
    });
    expect(classifyPress(snap([A], [row(A, true)]), snap([A], [row(A, true)]), "refused")).toEqual({
      attemptId: null,
      consumed: false,
    });
  });
  it("missing snapshot, unsettled press, conflicting claim/usage or multiple new attempts -> unknown", () => {
    expect(classifyPress(null, snap([A], [row(A, true)]), "refused").consumed).toBe("unknown");
    expect(classifyPress(snap([], []), null, "refused").consumed).toBe("unknown");
    expect(classifyPress(snap([], []), snap([A], [row(A, true)]), "unknown").consumed).toBe("unknown");
    // claim with no usage at all
    expect(classifyPress(snap([], []), snap([A], []), "refused").consumed).toBe("unknown");
    // claim names an attempt the new usage does not show
    expect(classifyPress(snap([], []), snap([A], [row(B, true)]), "refused").consumed).toBe("unknown");
    // two new attempts
    expect(classifyPress(snap([], []), snap([A], [row(A, true), row(B, false)]), "refused").consumed).toBe("unknown");
    // a second claim under a unique index cannot happen; if it appears the records disagree
    expect(classifyPress(snap([A], []), snap([A, B], [row(B, true)]), "refused").consumed).toBe("unknown");
    // scope changed between snapshots
    expect(classifyPress(snap([], []), snap([A], [row(A, true)], B), "refused").consumed).toBe("unknown");
  });
  it("PLANT: a code-only classifier and a row counter both contradict these fixtures (so they would go red)", () => {
    // What a code-driven classifier would say: `workspace_paused` never consumes.
    const codeOnly = (code: string) => ({ attemptId: null, consumed: code !== "workspace_paused" });
    expect(codeOnly("workspace_paused")).not.toEqual(classifyPress(snap([], []), snap([A], [row(A, true)]), "refused"));
    // What a row counter would say: two usage rows = two attempts = unknown.
    const rowCounter = (after: EvidenceSnapshot) => (after.usage.length === 1 ? { attemptId: after.usage[0].attemptId, consumed: after.usage[0].consumed } : { attemptId: null, consumed: "unknown" as const });
    expect(rowCounter(snap([A], [row(A, true), row(A, true)]))).not.toEqual(
      classifyPress(snap([], []), snap([A], [row(A, true), row(A, true)]), "refused")
    );
  });
});

describe("retryDecision — one retry, only a pre-vendor run-slot code AND consumed=false", () => {
  const base = { code: "run_slot_busy", assemblyKind: null, pressOrdinal: 1, consumed: false as const };
  it("retries once on run_slot_busy / server_at_capacity with consumed=false on press 1", () => {
    expect(retryDecision(base).retry).toBe(true);
    expect(retryDecision({ ...base, code: "server_at_capacity" }).retry).toBe(true);
  });
  it("never retries on unknown evidence, even with a pre-vendor code (B0-BILL-1)", () => {
    const d = retryDecision({ ...base, consumed: "unknown" });
    expect(d.retry).toBe(false);
    expect(d.reason).toContain("NOT retrying on the code alone");
  });
  it("never retries a consumed press, a kind-bearing refusal, workspace_paused, a kindless post-vendor code, a null code, or press 2", () => {
    expect(retryDecision({ ...base, consumed: true }).retry).toBe(false);
    expect(retryDecision({ ...base, assemblyKind: "bad_shape" }).retry).toBe(false);
    expect(retryDecision({ ...base, code: "workspace_paused" }).retry).toBe(false);
    expect(retryDecision({ ...base, code: "inference_unusable" }).retry).toBe(false);
    expect(retryDecision({ ...base, code: null }).retry).toBe(false);
    expect(retryDecision({ ...base, pressOrdinal: 2 }).retry).toBe(false);
  });
});

describe("countConsumingRefusals — distinct (runId, profileId, attemptId), stop on unknown/conflict", () => {
  const rec = (over: Partial<ConsumptionRecord>): ConsumptionRecord => ({
    runId: "r1",
    persona: "solo-creator",
    pressOrdinal: 1,
    profileId: PROFILE,
    attemptId: A,
    outcome: "refused",
    consumed: true,
    ...over,
  });
  it("duplicates of one identity count once; a different run or attempt counts separately", () => {
    expect(countConsumingRefusals([rec({}), rec({ pressOrdinal: 2 })])).toEqual({ stop: false, count: 1 });
    expect(countConsumingRefusals([rec({}), rec({ attemptId: B })])).toEqual({ stop: false, count: 2 });
    expect(countConsumingRefusals([rec({}), rec({ runId: "r2" })])).toEqual({ stop: false, count: 2 });
  });
  it("succeeded or non-consuming records never count", () => {
    expect(countConsumingRefusals([rec({ outcome: "succeeded" }), rec({ consumed: false, attemptId: B })])).toEqual({
      stop: false,
      count: 0,
    });
  });
  it("any unknown record stops the demonstration; conflicting duplicates stop it", () => {
    expect(countConsumingRefusals([rec({}), rec({ pressOrdinal: 2, consumed: "unknown", attemptId: null })])).toEqual({
      stop: true,
      reason: "unknown-record",
      count: 1,
    });
    expect(countConsumingRefusals([rec({}), rec({ pressOrdinal: 2, consumed: false })])).toEqual({
      stop: true,
      reason: "conflicting-duplicates",
      count: 1,
    });
  });
});

describe("readIncludedBuildEvidence — argument vector, stdin binding, read-only transaction, scope", () => {
  const payload = (workspaces: string[]) =>
    JSON.stringify({ workspaces, claims: [A], usage: [{ attemptId: A, outcome: "succeeded", consumed: true }] });

  it("invokes docker exec -i … psql with -f - and psql variables; the raw values never enter the SQL text", () => {
    const calls: { file: string; args: readonly string[]; input: string }[] = [];
    const run: CommandRunner = (file, args, input) => {
      calls.push({ file, args, input });
      return `${payload([WS])}\n`;
    };
    const snapshot = readIncludedBuildEvidence(EMAIL, PROFILE, run);
    expect(snapshot).toEqual({ workspaceId: WS, claims: [A], usage: [{ attemptId: A, outcome: "succeeded", consumed: true }] });
    expect(calls).toHaveLength(1);
    const { file, args, input } = calls[0];
    expect(file).toBe("docker");
    expect(args.slice(0, 3)).toEqual(["exec", "-i", "respin-postgres"]);
    expect(args).toContain("-f");
    expect(args[args.indexOf("-f") + 1]).toBe("-");
    expect(args).not.toContain("-c");
    expect(args).toContain(`email=${EMAIL}`);
    expect(args).toContain(`profile=${PROFILE}`);
    expect(args).toContain(`purpose=${ONBOARDING_BRAIN_PURPOSE}`);
    expect(args.filter((a) => a === "-v")).toHaveLength(4); // ON_ERROR_STOP + three bound variables
    expect(input).toBe(EVIDENCE_SQL);
    expect(input).not.toContain(EMAIL);
    expect(input).not.toContain(PROFILE);
    expect(input).toMatch(/^\s*BEGIN READ ONLY;/);
    expect(input).toContain(":'email'");
    expect(input).toContain(":'profile'::uuid");
    expect(input).toContain(":'purpose'");
    // both scope predicates: owner membership, and the profile inside that workspace
    expect(input).toContain("m.role = 'owner'");
    expect(input).toContain("cp.workspace_id = m.workspace_id");
    expect(input).toContain("f.workspace_id = ws.id AND f.profile_id = :'profile'::uuid");
    expect(input).toContain("mu.workspace_id = ws.id AND mu.profile_id = :'profile'::uuid");
    // metering identity only — never prompt/response or the raw usage JSON
    expect(input).not.toMatch(/usage_raw|prompt|response|content/);
  });

  it("refuses invalid inputs before any command runs", () => {
    let ran = 0;
    const run: CommandRunner = () => {
      ran += 1;
      return payload([WS]);
    };
    expect(() => readIncludedBuildEvidence("not an email'; drop", PROFILE, run)).toThrow(/unexpected email shape/);
    expect(() => readIncludedBuildEvidence(EMAIL, "not-a-uuid", run)).toThrow(/non-UUID profile/);
    expect(ran).toBe(0);
  });

  it("refuses a foreign or ambiguous scope: zero or two owner workspaces for the selected profile", () => {
    expect(() => readIncludedBuildEvidence(EMAIL, PROFILE, () => payload([]))).toThrow(/exactly one owner workspace/);
    expect(() => readIncludedBuildEvidence(EMAIL, PROFILE, () => payload([WS, B]))).toThrow(/exactly one owner workspace/);
    expect(() => readIncludedBuildEvidence(EMAIL, PROFILE, () => "")).toThrow(/no JSON row/);
    expect(() =>
      readIncludedBuildEvidence(EMAIL, PROFILE, () => JSON.stringify({ workspaces: [WS], claims: [1], usage: [] }))
    ).toThrow(/malformed claim/);
  });

  it("the pre-vendor retry list is exactly the two run-slot codes", () => {
    expect([...PRE_VENDOR_RETRY_CODES]).toEqual(["run_slot_busy", "server_at_capacity"]);
  });
});

describe("failed-dispatch retention — structured records and the validated manifest", () => {
  const base: ConsumptionRecord = {
    runId: "123-1",
    persona: "solo-creator",
    pressOrdinal: 1,
    profileId: PROFILE,
    attemptId: null,
    outcome: "unknown",
    consumed: "unknown",
  };

  it("currentRunId never guesses: GitHub run id + attempt, else JOURNEY_RUN_ID, else it throws", () => {
    const env = (e: Record<string, string>) => e as NodeJS.ProcessEnv;
    expect(currentRunId(env({ GITHUB_RUN_ID: "7", GITHUB_RUN_ATTEMPT: "2" }))).toBe("7-2");
    expect(currentRunId(env({ GITHUB_RUN_ID: "7" }))).toBe("7-1");
    expect(currentRunId(env({ JOURNEY_RUN_ID: "local-a" }))).toBe("local-a");
    expect(() => currentRunId(env({}))).toThrow(/no run id/);
  });

  it("writes the initial unknown record, then atomically replaces it with the settled one", () => {
    const dir = tmp();
    writeConsumptionRecord(base, dir);
    expect(JSON.parse(readFileSync(consumptionRecordPath("solo-creator", 1, dir), "utf8"))).toEqual(base);
    writeConsumptionRecord({ ...base, attemptId: A, outcome: "refused", consumed: true }, dir);
    expect(JSON.parse(readFileSync(consumptionRecordPath("solo-creator", 1, dir), "utf8"))).toEqual({
      ...base,
      attemptId: A,
      outcome: "refused",
      consumed: true,
    });
  });

  function artifactsWith(records: Record<string, unknown>): string {
    const root = tmp();
    mkdirSync(join(root, "consumption"), { recursive: true });
    for (const [name, value] of Object.entries(records)) {
      writeFileSync(join(root, "consumption", name), typeof value === "string" ? value : JSON.stringify(value));
    }
    return root;
  }

  it("an initial (unknown) record keeps the manifest incomplete and stops the counter — never zero", () => {
    const root = artifactsWith({ "solo-creator-1.json": base, "studio-operator-1.json": { ...base, persona: "studio-operator", attemptId: A, outcome: "succeeded", consumed: true } });
    const m = buildConsumptionManifest(root, "123-1");
    expect(m.complete).toBe(false);
    expect(m.unknownCount).toBe(1);
    expect(m.consumingRefusals).toEqual({ stop: true, reason: "unknown-record", count: 0 });
  });

  it("a missing persona keeps the manifest incomplete even with every present record settled", () => {
    const root = artifactsWith({ "solo-creator-1.json": { ...base, attemptId: A, outcome: "refused", consumed: true } });
    const m = buildConsumptionManifest(root, "123-1");
    expect(m.complete).toBe(false);
    expect(m.personas["studio-operator"]).toEqual({ records: 0, settled: 0 });
    expect(m.consumingRefusals).toEqual({ stop: false, count: 1 });
  });

  it("duplicate records of one identity count once; conflicting duplicates are rejected", () => {
    const settled = { ...base, attemptId: A, outcome: "refused", consumed: true };
    const ok = artifactsWith({
      "solo-creator-1.json": settled,
      "solo-creator-2.json": { ...settled, pressOrdinal: 2 },
      "studio-operator-1.json": { ...settled, persona: "studio-operator", profileId: WS, attemptId: B, outcome: "succeeded", consumed: true },
    });
    expect(buildConsumptionManifest(ok, "123-1").consumingRefusals).toEqual({ stop: false, count: 1 });
    const conflict = artifactsWith({
      "solo-creator-1.json": settled,
      "solo-creator-2.json": { ...settled, pressOrdinal: 2, consumed: false },
    });
    expect(() => buildConsumptionManifest(conflict, "123-1")).toThrow(ConsumptionRejected);
  });

  it("rejects a foreign run id, an invalid profile/attempt id, extra fields, a wrong path, non-JSON and a symlink", () => {
    const settled = { ...base, attemptId: A, outcome: "refused", consumed: true };
    const cases: Record<string, Record<string, unknown>> = {
      foreignRun: { "solo-creator-1.json": { ...settled, runId: "999-1" } },
      badProfile: { "solo-creator-1.json": { ...settled, profileId: "profile-7" } },
      badAttempt: { "solo-creator-1.json": { ...settled, attemptId: "att-1" } },
      extraField: { "solo-creator-1.json": { ...settled, code: "SENTINEL" } },
      missingField: { "solo-creator-1.json": Object.fromEntries(Object.entries(settled).filter(([k]) => k !== "consumed")) },
      wrongPath: { "editor-seat-1.json": settled },
      ordinalMismatch: { "solo-creator-2.json": settled },
      zeroOrdinal: { "solo-creator-0.json": { ...settled, pressOrdinal: 0 } },
      notJson: { "solo-creator-1.json": "{not json" },
      badOutcome: { "solo-creator-1.json": { ...settled, outcome: "ok" } },
    };
    for (const [name, records] of Object.entries(cases)) {
      const root = artifactsWith(records);
      expect(() => buildConsumptionManifest(root, "123-1"), name).toThrow(ConsumptionRejected);
    }
    const root = artifactsWith({});
    const target = join(root, "target.json");
    writeFileSync(target, JSON.stringify(settled));
    try {
      symlinkSync(target, join(root, "consumption", "solo-creator-1.json"));
    } catch {
      // symlink creation needs a privilege this host may not grant; the case is then NOT RUN here
      return;
    }
    expect(() => buildConsumptionManifest(root, "123-1")).toThrow(/symlink/);
  });

  it("writes only into an empty output directory and re-serialises only the allowlisted fields", () => {
    const settled = { ...base, attemptId: A, outcome: "refused", consumed: true };
    const root = artifactsWith({ "solo-creator-1.json": settled, "studio-operator-1.json": { ...settled, persona: "studio-operator" } });
    const manifest = buildConsumptionManifest(root, "123-1");
    const out = join(tmp(), "manifest");
    const written = writeConsumptionManifest(manifest, out);
    const text = readFileSync(written, "utf8");
    const parsed = JSON.parse(text);
    expect(parsed.complete).toBe(true);
    expect(parsed.records).toHaveLength(2);
    expect(Object.keys(parsed.records[0]).sort()).toEqual(["attemptId", "consumed", "outcome", "persona", "pressOrdinal", "profileId", "runId"]);
    expect(() => writeConsumptionManifest(manifest, out)).toThrow(/not empty/);
  });

  describe("alternate-upload witness (B11-C1): a raw record with a sentinel never reaches either upload", () => {
    const SENTINEL = "SENTINEL-7f3a9c";
    const files = [
      "respin/e2e/journeys/artifacts/solo-creator/console.log",
      "respin/e2e/journeys/artifacts/solo-creator/screenshots/04-own-posts-saved.png",
      "respin/e2e/journeys/artifacts/consumption/solo-creator-1.json",
      "respin/e2e/journeys/artifacts/_handoff/editor-seat.json",
      "respin/playwright-report/solo-creator/index.html",
      "respin/playwright-report/solo-creator/data/trace-abc.zip",
      "respin/playwright-report/bootstrap/data/trace-def.zip",
    ];
    const text = workflowText();
    const mainLines = uploadPathLines(text, "journeys-");

    it("the main upload excludes the raw consumption record, the handoff and traces; keeps logs, shots and reports", () => {
      expect(uploadPopulation(mainLines, files).sort()).toEqual([
        "respin/e2e/journeys/artifacts/solo-creator/console.log",
        "respin/e2e/journeys/artifacts/solo-creator/screenshots/04-own-posts-saved.png",
        "respin/playwright-report/solo-creator/index.html",
      ]);
      expect(mainLines).toContain("!respin/e2e/journeys/artifacts/_handoff/**");
      expect(mainLines).toContain("!respin/e2e/journeys/artifacts/consumption/**");
      expect(mainLines).toContain("!respin/playwright-report/*/data/*.zip");
    });

    it("removing ONLY the consumption exclusion lets the sentinel record into the main upload (the exclusion is load-bearing)", () => {
      const without = mainLines.filter((l) => l !== "!respin/e2e/journeys/artifacts/consumption/**");
      expect(uploadPopulation(without, files)).toContain("respin/e2e/journeys/artifacts/consumption/solo-creator-1.json");
    });

    it("the separate upload is ineligible when validation rejects the sentinel-bearing record: no manifest is written", () => {
      const root = artifactsWith({
        "solo-creator-1.json": { ...base, attemptId: A, outcome: "refused", consumed: true, code: SENTINEL },
      });
      expect(() => buildConsumptionManifest(root, "123-1")).toThrow(ConsumptionRejected);
      const separate = uploadPathLines(text, "consumption-");
      expect(separate).toEqual(["${{ runner.temp }}/consumption-manifest/consumption.json"]);
      // and when validation PASSES, the serialised manifest carries no raw string from the record file
      const clean = artifactsWith({
        "solo-creator-1.json": { ...base, attemptId: A, outcome: "refused", consumed: true },
        "studio-operator-1.json": { ...base, persona: "studio-operator", attemptId: B, outcome: "succeeded", consumed: true },
      });
      const out = join(tmp(), "m");
      const written = writeConsumptionManifest(buildConsumptionManifest(clean, "123-1"), out);
      expect(readFileSync(written, "utf8")).not.toContain(SENTINEL);
    });

    it("inverse cases hold in the workflow text: a valid manifest uploads after a behavioural failure; failed cleanup blocks both", () => {
      expect(text).toMatch(/id: consumption\n\s+if: always\(\) && steps\.cleanup\.outputs\.safe_to_upload == 'true'\n/);
      expect(text).toMatch(/name: Upload consumption manifest\n\s+id: upload-consumption\n\s+if: always\(\) && steps\.cleanup\.outputs\.safe_to_upload == 'true' && steps\.consumption\.outcome == 'success'\n/);
      expect(text).toMatch(/name: Upload journey report\n\s+id: upload-report\n\s+if: always\(\) && steps\.cleanup\.outputs\.safe_to_upload == 'true' && steps\.scan\.outcome == 'success'\n/);
      // the consumption steps never mention the behavioural scan
      const consumptionBlock = text.slice(text.indexOf("id: consumption"), text.indexOf("name: Scan journey notes"));
      expect(consumptionBlock).not.toContain("steps.scan");
    });
  });
});
