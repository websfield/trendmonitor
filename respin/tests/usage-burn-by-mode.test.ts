// R9 (slice 2b) / R17a (slice 6): /usage's by-mode panel and the note above it.
//
// TWO GUARDS, and they answer different questions:
//
//  1. THE PURPOSE SET IS DERIVED, NOT ASSERTED. This scan finds every spend
//     purpose CONSTANT defined anywhere in `packages/credits/src` and fails if
//     the set no longer matches `KNOWN_SPEND_PURPOSES` — so the note's sentence
//     cannot go stale behind a rename or an addition.
//
//  2. THE SPLIT IS NOT DERIVED FROM THE COST ROLLUP (mutation M13). R17a's own
//     words: "There is no mode inference from the cost rollup."
//     `workspace_spend_monthly` is OUR vendor cost in micro-USD at a
//     `(workspace, month, tier)` grain with no purpose and no mode column, so a
//     split derived from it would be an allocation of our spending wearing the
//     label of the creator's. The behavioural half of M13 lives in
//     `packages/db/tests/burn-by-mode.test.ts` (two modes with different totals
//     against a single mode-less rollup row); the half HERE is the source
//     scan — and per CLAUDE.md 2026-08-21 it asserts it finds a PLANTED
//     violation, because a scan reporting zero violations is otherwise
//     indistinguishable from a scan that is working.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KNOWN_SPEND_PURPOSES,
  KNOWN_SPEND_PURPOSE_COUNT,
  burnByModeNote,
} from "../app/(product)/usage/usage-view";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CREDITS_SRC = join(ROOT, "packages", "credits", "src");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Comments stripped, so a scan for a NAME cannot be tripped by prose that
 *  explains why the name is absent — which is exactly what the docblocks on
 *  `burnByMode` and on this panel do. */
function withoutComments(src: string): string {
  return src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Every distinct spend-purpose CONSTANT defined in the package, by its own
 * string value — not every `purpose:` call site, which names the CONSTANT
 * (`purpose: ONBOARDING_BRAIN_PURPOSE`), never a raw literal (a first draft
 * of this scan matched the call-site shape and found zero, because every
 * real call site passes the constant, exactly as `RecordModelUsageParams`'s
 * docblock in with-workspace.ts intends). Scanning the DEFINITION site is
 * both the shape that actually appears and the more precise signal: it names
 * the true source of "how many purposes exist" rather than counting how many
 * places happen to reference one.
 */
function distinctPurposeLiterals(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(CREDITS_SRC)) {
    const src = withoutComments(readFileSync(file, "utf8"));
    for (const m of src.matchAll(
      /export\s+const\s+\w*PURPOSE\w*\s*=\s*(["'`])([^"'`]*)\1/g
    )) {
      found.add(m[2]);
    }
  }
  return found;
}

describe("R9/R17a: the by-mode note's claim is derived from the real purposes, not asserted", () => {
  it("the scan is not vacuous — it finds both purposes known to exist today", () => {
    const purposes = distinctPurposeLiterals();
    expect(purposes.size).toBeGreaterThan(0);
    expect(purposes).toContain("onboarding_brain");
    // Slice 6's generation purpose (R12). It is a SEPARATE constant from
    // `ONBOARDING_BRAIN_PURPOSE` on purpose — the grain the included-build
    // claim is keyed on — and its arrival is exactly what made the previous
    // version of this note ("exactly one thing spends credits today") false.
    expect(purposes).toContain("generation");
  });

  it("the real SET matches KNOWN_SPEND_PURPOSES — a mismatch means burnByModeNote's copy is stale and must be rewritten, not that this test should be relaxed", () => {
    // A SET, NOT A COUNT (strengthened in slice 6, stage D). The count alone
    // could not tell "generation was added" from "onboarding_brain was renamed
    // and something else appeared": two purposes either way, one green test,
    // and a sentence naming a purpose that no longer exists.
    const purposes = [...distinctPurposeLiterals()].sort();
    expect(
      purposes,
      `packages/credits/src now writes these distinct spend purposes (${purposes.join(", ")}) but usage-view.tsx names ${[...KNOWN_SPEND_PURPOSES].join(", ")} — burnByModeNote's copy is stale`
    ).toEqual([...KNOWN_SPEND_PURPOSES].sort());
    expect(purposes.length).toBe(KNOWN_SPEND_PURPOSE_COUNT);
  });

  it("the note names the real count, says how the split is MADE, and never claims an estimate", () => {
    const note = burnByModeNote();
    // It says how many things spend, from the constant rather than from prose.
    expect(note).toContain(String(KNOWN_SPEND_PURPOSE_COUNT));
    // Both stale claims are gone and cannot come back silently: the slice-2b
    // "one purpose" sentence, and the stage-D "no split yet" sentence that the
    // split itself made false.
    expect(note).not.toMatch(/exactly one thing spends credits today/i);
    expect(note).not.toMatch(/not split by mode yet/i);
    // R17a: no mode inference from the cost rollup, said to the creator.
    expect(note).toMatch(/nothing here is estimated from the totals/i);
    // ...and it names the mechanism that replaced the absence.
    expect(note).toMatch(/joining each charge to the draft it paid for/i);
    // The second purpose is named as NOT a mode — the join's whole point.
    expect(note).toMatch(/voice brain, which is not a mode/i);
  });
});

// ---------------------------------------------------------------- mutation M13

/**
 * The two files the by-mode number flows through: the scoped read that computes
 * it, and the page that renders it.
 *
 * A LIST, NOT A PATH (CLAUDE.md 2026-08-29). The by-mode number has exactly
 * these two producers today, and adding a third — a second accessor, a
 * `packages/credits` composition — costs a line here. A population written as
 * one path narrows silently the day a second path appears.
 */
const M13_POPULATION = [
  {
    file: "packages/db/src/with-workspace.ts",
    /** Only the function, so its own docblock's explanation of what it refuses
     *  to read is not mistaken for the thing it refuses to read. */
    only: "burnByMode",
  },
  { file: "app/(product)/usage/page.tsx", only: null },
] as const;

/** The rollup, by every name it can be reached under. */
const COST_ROLLUP_NAMES = [
  "workspaceSpendMonthly",
  "workspace_spend_monthly",
  "reconcileSpend",
  "costMicroUsd",
];

function mentionsCostRollup(code: string): string[] {
  return COST_ROLLUP_NAMES.filter((n) => code.includes(n));
}

/** From `export async function <name>(` up to the next top-level `export`. */
function functionSource(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) throw new Error(`no such function: ${name}`);
  const after = src.indexOf("\nexport ", start + 1);
  return src.slice(start, after < 0 ? src.length : after);
}

describe("M13: by-mode burn may not be derived from workspace_spend_monthly", () => {
  it("the scan finds a PLANTED violation of each shape it claims to cover — otherwise a green result is meaningless", () => {
    expect(
      mentionsCostRollup(
        "const [row] = await db.select().from(workspaceSpendMonthly);"
      )
    ).toEqual(["workspaceSpendMonthly"]);
    expect(
      mentionsCostRollup("sql`select cost_micro_usd from workspace_spend_monthly`")
    ).toEqual(["workspace_spend_monthly"]);
    expect(mentionsCostRollup("const r = await reconcileSpend(db);")).toEqual([
      "reconcileSpend",
    ]);
    // And the extractor is not silently returning nothing: a planted call
    // INSIDE the real function is seen.
    const src = readFileSync(
      join(ROOT, "packages", "db", "src", "with-workspace.ts"),
      "utf8"
    );
    const planted = functionSource(src, "burnByMode").replace(
      "assertScoped(scope);",
      "assertScoped(scope);\n  await db.select().from(workspaceSpendMonthly);"
    );
    expect(mentionsCostRollup(withoutComments(planted))).toEqual([
      "workspaceSpendMonthly",
    ]);
  });

  it("the extractor really reaches burnByMode's body, and that body names the JOIN it is supposed to use", () => {
    const src = readFileSync(
      join(ROOT, "packages", "db", "src", "with-workspace.ts"),
      "utf8"
    );
    const body = withoutComments(functionSource(src, "burnByMode"));
    expect(body).toContain("generationAttempts");
    expect(body).toContain("generations.mode");
    expect(body).toContain("assertScoped(scope)");
  });

  it("neither producer of the by-mode number touches the cost rollup", () => {
    for (const entry of M13_POPULATION) {
      const raw = readFileSync(join(ROOT, entry.file), "utf8");
      const code = withoutComments(
        entry.only ? functionSource(raw, entry.only) : raw
      );
      expect(
        mentionsCostRollup(code),
        `${entry.file}${entry.only ? `:${entry.only}` : ""} reaches the cost rollup — R17a forbids inferring modes from it`
      ).toEqual([]);
    }
  });
});

// ------------------------------------------------------------- the page wiring

const gate = vi.hoisted(() => ({ requireUser: vi.fn() }));
const dbMocks = vi.hoisted(() => ({
  ensureUserWorkspace: vi.fn(),
  withWorkspace: vi.fn(),
  monthlySpend: vi.fn(),
  burnByMode: vi.fn(),
  ledger: vi.fn(),
  subscription: vi.fn(),
}));
const creditMocks = vi.hoisted(() => ({
  getBalance: vi.fn(),
  getBillingState: vi.fn(),
}));

vi.mock("@respin/auth", () => ({
  requireUser: gate.requireUser,
  requireAdmin: vi.fn(),
}));

vi.mock("@respin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/db")>()),
  respinDb: {
    ensureUserWorkspace: dbMocks.ensureUserWorkspace,
    withWorkspace: dbMocks.withWorkspace,
    monthlySpend: dbMocks.monthlySpend,
    burnByMode: dbMocks.burnByMode,
  },
}));

// `importOriginal` so `burnPeriod` and `modeLabel` are the REAL ones —
// the period assertions below are only worth something if the authority under
// test is the authority that ships.
vi.mock("@respin/credits/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/credits/app-server")>()),
  respinCredits: {
    getBalance: creditMocks.getBalance,
    getBillingState: creditMocks.getBillingState,
  },
}));

const UsagePage = (await import("../app/(product)/usage/page")).default;

const NOW = new Date("2026-08-17T00:00:00Z");

const renderUsage = async () =>
  renderToStaticMarkup(await UsagePage({ searchParams: Promise.resolve({}) }));

describe("/usage renders the split from the scoped join, on the right period", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T09:30:00Z"));
    gate.requireUser.mockResolvedValue({ id: "u_1" });
    dbMocks.ensureUserWorkspace.mockResolvedValue({
      workspace: { id: "ws_1", name: "Workspace" },
    });
    dbMocks.withWorkspace.mockResolvedValue({
      workspaceId: "ws_1",
      role: "owner",
      accessors: { ledger: dbMocks.ledger, subscription: dbMocks.subscription },
    });
    creditMocks.getBalance.mockResolvedValue({ balance: 22, asOf: NOW });
    creditMocks.getBillingState.mockResolvedValue({
      tier: "free",
      state: "free",
    });
    dbMocks.ledger.mockResolvedValue([]);
    dbMocks.subscription.mockResolvedValue([]);
    dbMocks.monthlySpend.mockResolvedValue({
      totalDebit: 20,
      hasAnyDebit: true,
      periodStart: new Date("2026-08-01T00:00:00Z"),
    });
    dbMocks.burnByMode.mockResolvedValue({
      periodStart: new Date("2026-08-01T00:00:00Z"),
      byMode: [{ mode: "hooks", credits: 3, debits: 1 }],
      notAGeneration: { credits: 17, debits: 1 },
      nonTerminalClaim: { credits: 0, debits: 0 },
    });
  });

  // The clock is frozen so "the UTC calendar month" is an exact instant to
  // assert against; it is handed back before it can reach another file.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows each mode by its CREATOR-FACING label, resolved on the server", async () => {
    const html = await renderUsage();
    expect(html).toContain('data-testid="burn-mode-hooks"');
    // `MODE_SPECS.hooks.label` — not the raw id, and not a label map living in
    // the view (`@respin/modes` is denied to app/**, R-64).
    expect(html).toContain("Hooks");
  });

  it("names the non-generation charge instead of filing it under a mode", async () => {
    const html = await renderUsage();
    expect(html).toContain('data-testid="burn-not-a-generation"');
    expect(html).toContain("Not a studio draft");
  });

  it("a charge whose draft never settled is shown as unattributed, with its own note", async () => {
    dbMocks.burnByMode.mockResolvedValue({
      periodStart: new Date("2026-08-01T00:00:00Z"),
      byMode: [],
      notAGeneration: { credits: 0, debits: 0 },
      nonTerminalClaim: { credits: 5, debits: 1 },
    });
    const html = await renderUsage();
    expect(html).toContain('data-testid="burn-non-terminal"');
    expect(html).toContain('data-testid="burn-non-terminal-note"');
    // It must NOT invent a mode for it.
    expect(html).not.toContain('data-testid="burn-mode-hooks"');
  });

  it("a failed split degrades to a stated refusal and does NOT take the total down with it", async () => {
    dbMocks.burnByMode.mockRejectedValue(new Error("connection lost"));
    const html = await renderUsage();
    expect(html).toContain('data-testid="burn-by-mode-error"');
    // The total, read by a separate call, still rendered.
    expect(html).toContain("20 credits spent this month");
  });

  it("FREE (no subscription): the split's period is the UTC calendar month, and it is the SAME instant the total used", async () => {
    dbMocks.subscription.mockResolvedValue([]);
    await renderUsage();
    const [, splitStart] = dbMocks.burnByMode.mock.calls[0];
    const [, totalStart] = dbMocks.monthlySpend.mock.calls[0];
    expect(splitStart).toEqual(new Date("2026-08-01T00:00:00Z"));
    // ONE derivation, not two that agree today. A second `burnPeriodStart(…,
    // new Date())` call is how the two panels come to describe different
    // months across a midnight boundary.
    expect(splitStart).toBe(totalStart);
  });

  it("PAID: the split's period is the subscription's own current_period_start, not the calendar month", async () => {
    const anniversary = new Date("2026-07-23T14:05:00Z");
    dbMocks.subscription.mockResolvedValue([
      { id: "sub_row", currentPeriodStart: anniversary },
    ]);
    creditMocks.getBillingState.mockResolvedValue({
      tier: "creator",
      state: "active",
    });
    await renderUsage();
    const [, splitStart] = dbMocks.burnByMode.mock.calls[0];
    const [, totalStart] = dbMocks.monthlySpend.mock.calls[0];
    expect(splitStart).toEqual(anniversary);
    expect(splitStart).toBe(totalStart);
  });

  it("the split is read through the SCOPE, never with a bare workspace id", async () => {
    await renderUsage();
    const [scopeArg] = dbMocks.burnByMode.mock.calls[0];
    expect(scopeArg).toBe(await dbMocks.withWorkspace.mock.results[0].value);
  });
});
