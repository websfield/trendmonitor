// `logResultAction`, EXECUTED — the server action no test ran.
//
// THE GAP THIS CLOSES, disclosed rather than found: the action's gate was
// proven by `gate-completeness.test.ts` (a source fixture), its wire names by
// `results-entry.test.tsx` (a shared constant plus two scans), and its
// refusal-copy mapping by "the class has an entry in the table". None of those
// runs the function. So the catch itself, the form→params translation, the
// date conversion, the lever pairing and the revalidation were unexercised —
// and a catch that classifies the wrong thing renders "Something went wrong"
// on a creator's own numbers, which is the registered `8c-R15` shape.
//
// THE POPULATION OF REFUSALS IS A LIST, NOT A DERIVATION (CLAUDE.md,
// 2026-08-29). That lesson has now cost this repo three shipped defects, and
// the third time the guard built after the second one still did not fire —
// because it derived "what can this path throw" from ONE module on the day a
// second appeared. So `THROWING_PATHS` below names every path that can raise
// into this action, each with the module it lives in, and every entry is
// driven through the real `billingErrorCode`. Adding a path to the action
// costs a line there.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";

const gate = vi.hoisted(() => ({ requireUser: vi.fn() }));
const db = vi.hoisted(() => ({
  ensureUserWorkspace: vi.fn(),
  withWorkspace: vi.fn(),
  recordResult: vi.fn(),
  decidePromotionProposal: vi.fn(),
  refreshPromotionProposals: vi.fn(),
  promotionProposalReview: vi.fn(),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const credits = vi.hoisted(() => ({ performanceLearningEntitlementFor: vi.fn() }));

vi.mock("@respin/auth", () => ({
  requireUser: gate.requireUser,
  requireAdmin: vi.fn(),
}));

vi.mock("@respin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/db")>()),
  respinDb: db,
}));

vi.mock("@respin/credits/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/credits/app-server")>()),
  respinCredits: credits,
}));

vi.mock("next/cache", () => ({ revalidatePath: cache.revalidatePath }));

const {
  ProfileAccessError,
  PromotionDecisionError,
  ResultDuplicateError,
  ResultInputError,
  ResultTargetError,
  ScopeForgeryError,
  TreatmentKeyError,
  WorkspaceAccessError,
} = await import("@respin/db");
const { BILLING_ERROR_COPY } = await import("../app/(product)/billing-errors");
const { RESULT_FIELD, leverField, IDLE_LOG_RESULT_STATE } = await import(
  "../app/(product)/results/log-state"
);
const { PROMOTION_FIELD } = await import("../app/(product)/results/promotion-state");
const { logResultAction, decidePromotionAction, refreshPromotionAction, reviewPromotionAction } = await import("../app/(product)/results/actions");
const { refreshedSentence, decidedSentence } = await import("../app/(product)/results/promotion-panel");
const { IDLE_PROMOTION_ACTION_STATE } = await import("../app/(product)/results/promotion-state");

/** A filled-in form, as the browser posts it. Overridable field by field. */
function form(over: Record<string, string | string[] | null> = {}): FormData {
  const base: Record<string, string> = {
    [RESULT_FIELD.generationId]: "g-1",
    [RESULT_FIELD.platform]: "TikTok",
    [RESULT_FIELD.audienceClass]: "organic",
    [RESULT_FIELD.observedFrom]: "2026-08-01",
    [RESULT_FIELD.observedTo]: "2026-08-08",
    [RESULT_FIELD.evidenceIntent]: "quantified_self_reported",
    [leverField("reach", "value")]: "4000",
    [leverField("reach", "denominator")]: "12000",
    [leverField("conversion", "value")]: "80",
    [leverField("conversion", "denominator")]: "4000",
    [RESULT_FIELD.note]: "Posted later in the day than usual.",
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...over })) {
    if (v === null) continue;
    for (const one of Array.isArray(v) ? v : [v]) fd.append(k, one);
  }
  return fd;
}

const storedRow = (over: Record<string, unknown> = {}) => ({
  id: "r-1",
  evidenceState: "quantified_self_reported",
  treatmentKey: "fw-1@2|hooks|act-9|follows_per_1k",
  ...over,
});

const run = (fd: FormData) =>
  logResultAction("p_1", IDLE_LOG_RESULT_STATE, fd);

function proposalDecision(decision: string, accept = [{ pointer: "/rules/0", asPlaceholder: false }]): FormData {
  const fd = new FormData();
  fd.set(PROMOTION_FIELD.proposalId, "proposal-1");
  fd.set(PROMOTION_FIELD.decision, decision);
  fd.set(PROMOTION_FIELD.freshnessToken, "fresh-1");
  fd.set(PROMOTION_FIELD.acceptConfirmedFields, JSON.stringify(accept));
  fd.set(PROMOTION_FIELD.rejectConfirmedFields, "[]");
  return fd;
}

const runDecision = (fd: FormData) =>
  decidePromotionAction("p_1", IDLE_PROMOTION_ACTION_STATE, fd);

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireUser.mockResolvedValue({ id: "u_1", name: "Ada" });
  db.ensureUserWorkspace.mockResolvedValue({
    workspace: { id: "ws_1", name: "Workspace" },
  });
  db.withWorkspace.mockResolvedValue({
    workspaceId: "ws_1",
    role: "owner",
    userId: "u_1",
  });
  db.recordResult.mockResolvedValue(storedRow());
  db.decidePromotionProposal.mockResolvedValue({ status: "accepted" });
  credits.performanceLearningEntitlementFor.mockResolvedValue("full");
});

describe("logResultAction: the gate", () => {
  it("gates ABOVE its own try — an unauthenticated POST redirects, it does not return a refusal", async () => {
    gate.requireUser.mockImplementation(async () => {
      redirect("/sign-in");
      throw new Error("unreachable");
    });
    let caught: (Error & { digest?: string }) | undefined;
    let returned: unknown;
    try {
      returned = await run(form());
    } catch (err) {
      caught = err as Error & { digest?: string };
    }
    // A refused POST must NOT return a form state: that would render a banner
    // to an unauthenticated caller instead of sending them to sign in.
    expect(returned).toBeUndefined();
    expect(caught?.digest).toMatch(/^NEXT_REDIRECT;/);
    expect(db.recordResult).not.toHaveBeenCalled();
  });
});

describe("logResultAction: the form becomes params, and nothing else does", () => {
  it("passes exactly the caller-suppliable fields, with the levers as PAIRS", async () => {
    await run(form({ confounders: ["topic_overlap", "account_growth"] }));
    expect(db.recordResult).toHaveBeenCalledTimes(1);
    const [scope, profileId, params, entitlement] = db.recordResult.mock.calls[0];
    expect(scope).toEqual(await db.withWorkspace.mock.results[0].value);
    expect(profileId).toBe("p_1");
    expect(params).toEqual({
      generationId: "g-1",
      platform: "TikTok",
      audienceClass: "organic",
      observedFrom: new Date("2026-08-01"),
      observedTo: new Date("2026-08-08"),
      reach: { value: "4000", denominator: "12000" },
      conversion: { value: "80", denominator: "4000" },
      confounders: ["topic_overlap", "account_growth"],
      note: "Posted later in the day than usual.",
    });
    expect(entitlement).toBe("full");
  });

  it("SENDS NO EVIDENCE STATE, no metric, no treatment key, no workspace id", async () => {
    // The five server-derived columns have no parameter, and this is the
    // executing witness that the action does not smuggle one in: the posted
    // `evidenceIntent` is present on the form above and absent from the params.
    await run(form());
    const params = db.recordResult.mock.calls[0][2] as Record<string, unknown>;
    for (const forbidden of [
      "evidenceState",
      "evidenceIntent",
      "metricKey",
      "metricDeclaredByDocId",
      "treatmentKey",
      "workspaceId",
      "profileId",
      "connectorSource",
    ]) {
      expect(
        Object.keys(params),
        `the action sent ${forbidden}, which is the server's to derive`
      ).not.toContain(forbidden);
    }
  });

  it("a blank optional field is OMITTED, not sent as an empty string", async () => {
    // `undefined` and `""` are different answers: contract C4 says a result
    // with no generation has no derivable treatment key, and `""` is not an
    // id — it is a value something else would have to interpret.
    await run(
      form({
        [RESULT_FIELD.generationId]: "",
        [RESULT_FIELD.note]: "   ",
      })
    );
    const params = db.recordResult.mock.calls[0][2] as Record<string, unknown>;
    expect(Object.keys(params)).not.toContain("generationId");
    expect(Object.keys(params)).not.toContain("note");
  });

  it.each([
    ["reach value only", leverField("reach", "value"), leverField("reach", "denominator")],
    ["reach denominator only", leverField("reach", "denominator"), leverField("reach", "value")],
    ["conversion value only", leverField("conversion", "value"), leverField("conversion", "denominator")],
    ["conversion denominator only", leverField("conversion", "denominator"), leverField("conversion", "value")],
  ])("forwards %s to the writer, which refuses it rather than silently making it unquantified", async (_label, supplied, missing) => {
    db.recordResult.mockRejectedValue(new ResultInputError("a lever needs both a value and denominator"));
    const state = await run(form({ [supplied]: "7", [missing]: "" }));
    expect(state).toMatchObject({ status: "refused", code: "result_input" });
    const params = db.recordResult.mock.calls[0][2] as Record<string, unknown>;
    const lever = supplied.startsWith("reach") ? "reach" : "conversion";
    expect(params[lever]).toEqual(
      supplied.endsWith("Value")
        ? { value: "7", denominator: "" }
        : { value: "", denominator: "7" }
    );
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("NO LEVERS AT ALL is a real submission — that is the unquantified result", async () => {
    await run(
      form({
        [leverField("reach", "value")]: "",
        [leverField("reach", "denominator")]: "",
        [leverField("conversion", "value")]: "",
        [leverField("conversion", "denominator")]: "",
      })
    );
    expect(db.recordResult).toHaveBeenCalledTimes(1);
    const params = db.recordResult.mock.calls[0][2] as Record<string, unknown>;
    expect(params.platform).toBe("TikTok");
    expect(Object.keys(params)).not.toContain("reach");
  });

  it("EVERY ticked confounder travels, unfiltered — none is dropped by this layer", async () => {
    await run(
      form({
        confounders: ["topic_overlap", "a_code_this_screen_has_never_heard_of"],
      })
    );
    const params = db.recordResult.mock.calls[0][2] as Record<string, unknown>;
    // Dropping the unknown one here would silently narrow what a creator said
    // about their own result; the closed set is the database's and the
    // writer's, and it refuses rather than this layer editing the answer.
    expect(params.confounders).toEqual([
      "topic_overlap",
      "a_code_this_screen_has_never_heard_of",
    ]);
  });

  it("no confounders ticked sends an EMPTY LIST, not an absent field", async () => {
    // "The creator named none" is a real answer and a different fact from
    // "nobody was asked" — the distinction the column's `[]` default draws.
    await run(form());
    const params = db.recordResult.mock.calls[0][2] as Record<string, unknown>;
    expect(params.confounders).toEqual([]);
  });

  it("CONVERTS the date, and does NOT validate it — an unparseable day stays Invalid", async () => {
    // A conversion, not a validation: the writer decides what a bad window
    // means, and a second check here would be a second answer. What this
    // proves is that the action does not silently substitute `new Date()` —
    // which would store TODAY for a creator who typed a bad date.
    await run(form({ [RESULT_FIELD.observedFrom]: "not-a-day" }));
    const params = db.recordResult.mock.calls[0][2] as {
      observedFrom: Date;
      observedTo: Date;
    };
    expect(params.observedFrom).toBeInstanceOf(Date);
    expect(Number.isNaN(params.observedFrom.getTime())).toBe(true);
    expect(Number.isNaN(params.observedTo.getTime())).toBe(false);
  });
});

describe("logResultAction: what it reports back", () => {
  it("reads the stored label OFF THE WRITE, never off the form", async () => {
    // R6's sentence is only true if it describes the ROW. The form posted
    // `quantified_self_reported` as its intent; the row came back
    // `unquantified`, and the state must carry the row's answer.
    db.recordResult.mockResolvedValue(
      storedRow({ evidenceState: "unquantified", treatmentKey: null })
    );
    const state = await run(form());
    expect(state).toEqual({
      status: "recorded",
      resultId: "r-1",
      evidenceState: "unquantified",
      joinsTreatmentGroup: false,
    });
  });

  it("a row WITH a treatment key can join a treatment group", async () => {
    const state = await run(form());
    expect(state).toMatchObject({
      status: "recorded",
      joinsTreatmentGroup: true,
    });
  });

  it("revalidates AFTER the write, and only after it commits", async () => {
    await run(form());
    expect(cache.revalidatePath).toHaveBeenCalledWith("/results");
    expect(db.recordResult).toHaveBeenCalledTimes(1);
  });

  it("a REFUSED write revalidates nothing — there is nothing to invalidate", async () => {
    db.recordResult.mockRejectedValue(new ResultInputError("a denominator of 0"));
    await run(form());
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("proposal actions: what crosses to the browser (audit Phase 2, P2-A3 / P2-A5 / R-171)", () => {
  const row = (id: string, status: string) => ({ id, status, source: "feedback", familyKey: "family" });

  it("P2-A3: the refresh counts the PROPOSED rows, not the whole history", async () => {
    db.refreshPromotionProposals.mockResolvedValue([
      row("a", "proposed"),
      row("b", "proposed"),
      row("c", "accepted"),
      row("d", "rejected"),
      row("e", "stale"),
    ]);
    const state = await refreshPromotionAction("p_1", IDLE_PROMOTION_ACTION_STATE, new FormData());
    expect(state).toEqual({ status: "refreshed", count: 2 });
    expect(refreshedSentence(2)).toBe("2 proposals available after refresh.");
    expect(refreshedSentence(1)).toBe("1 proposal available after refresh.");
  });

  it("P2-A5: the review is projected field by field — a planted DB-only field never serialises", async () => {
    const SENTINEL = "DB-ONLY-SENTINEL";
    db.promotionProposalReview.mockResolvedValue({
      proposal: {
        id: "proposal-1",
        source: "feedback",
        status: "proposed",
        strength: "repeated",
        payload: { value: "Reject a draft that could be true of anyone." },
        familyKey: SENTINEL,
        evidenceDigest: SENTINEL,
        workspaceId: SENTINEL,
        decisionUserId: SENTINEL,
        plantedColumn: SENTINEL,
      },
      resultEvidence: [{ id: "r1", role: "treatment", reachValue: SENTINEL, connectorEventId: SENTINEL }],
      feedbackEvidence: [{ feedbackId: "f1", generationId: "g1", profileId: SENTINEL, basisBrainDocId: SENTINEL }],
      baseBrainDocId: SENTINEL,
      mergedContent: { rules: ["Reject a draft that could be true of anyone."] },
      claims: [{
        pointer: "/rules/0",
        displayedValue: "Reject a draft that could be true of anyone.",
        sourceEvidence: { quote: "/rules/0 = x", inputId: SENTINEL, inputClass: "feedback_summary" },
      }],
      freshnessToken: "fresh-1",
      learningEligibility: { kind: "structured_feedback", occurrences: 3 },
      alreadyPresent: false,
      plantedTopLevel: SENTINEL,
    });
    const fd = new FormData();
    fd.set(PROMOTION_FIELD.proposalId, "proposal-1");
    const state = await reviewPromotionAction("p_1", IDLE_PROMOTION_ACTION_STATE, fd);
    expect(state.status).toBe("reviewed");
    // NON-VACUITY: the projection carried the real fields through.
    expect(JSON.stringify(state)).toContain("Reject a draft that could be true of anyone.");
    expect(JSON.stringify(state)).toContain("fresh-1");
    // THE WITNESS: the whole object, serialised, carries no DB-only field.
    expect(JSON.stringify(state)).not.toContain(SENTINEL);
  });

  it("R-171: an accept of a value already present says so", async () => {
    db.decidePromotionProposal.mockResolvedValue({ status: "accepted", reason: "already_present" });
    const state = await runDecision(proposalDecision("accept"));
    expect(state).toEqual({ status: "decided", decision: "accepted", alreadyPresent: true });
    expect(decidedSentence({ decision: "accepted", alreadyPresent: true })).toMatch(/already in the document it targets, so no new version was written/);
    expect(decidedSentence({ decision: "rejected", alreadyPresent: false })).toBe("Proposal rejected.");
  });
});

describe("proposal decision action: the reviewed payload is decision-specific", () => {
  it("passes the exact checked reviewed confirmation set for accept", async () => {
    const confirmed = [
      { pointer: "/rules/0", asPlaceholder: false },
      { pointer: "/rules/1", asPlaceholder: true },
    ];
    const state = await runDecision(proposalDecision("accept", confirmed));
    expect(state).toEqual({ status: "decided", decision: "accepted", alreadyPresent: false });
    expect(db.decidePromotionProposal).toHaveBeenCalledWith(
      expect.anything(),
      "p_1",
      expect.objectContaining({ decision: "accept", confirmedFields: confirmed }),
      "full"
    );
  });

  it("passes no confirmations for exact reject", async () => {
    db.decidePromotionProposal.mockResolvedValue({ status: "rejected" });
    const state = await runDecision(proposalDecision("reject"));
    expect(state).toEqual({ status: "decided", decision: "rejected", alreadyPresent: false });
    expect(db.decidePromotionProposal).toHaveBeenCalledWith(
      expect.anything(),
      "p_1",
      expect.objectContaining({ decision: "reject", confirmedFields: [] }),
      "full"
    );
  });

  it.each([
    ["unchecked", []],
    ["partially checked", [{ pointer: "/rules/0", asPlaceholder: false }]],
  ])("returns the server refusal when an accept is %s", async (_label, confirmedFields) => {
    db.decidePromotionProposal.mockRejectedValue(
      new PromotionDecisionError("the confirmed pointer set is not the complete reviewed claim set")
    );
    const state = await runDecision(proposalDecision("accept", confirmedFields));
    expect(state).toMatchObject({ status: "refused", code: "promotion_decision" });
    expect(db.decidePromotionProposal).toHaveBeenCalledWith(
      expect.anything(),
      "p_1",
      expect.objectContaining({ decision: "accept", confirmedFields }),
      "full"
    );
  });

  it("refuses an unknown decision before the terminal capability", async () => {
    const state = await runDecision(proposalDecision("anything-else"));
    expect(state).toMatchObject({ status: "refused", code: "promotion_decision" });
    expect(db.decidePromotionProposal).not.toHaveBeenCalled();
  });
});

/**
 * EVERY PATH THAT CAN RAISE INTO THIS ACTION — a LIST, with the module each
 * lives in, because a derived population is the defect this repo has shipped
 * three times.
 *
 * Two things make an entry: a class the write path itself raises, and a class
 * the SHARED SCOPING layer raises before the write is reached. The second
 * group is the one a derivation misses, because it is not in `results-ops.ts`
 * at all — `scopeForUser` runs first, inside the same try.
 */
const THROWING_PATHS: readonly {
  path: string;
  module: string;
  make: () => Error;
  /** The code `billingErrorCode` must classify it as. */
  code: keyof typeof BILLING_ERROR_COPY;
}[] = [
  {
    path: "the generation named no derivable treatment (treatmentKeyFor)",
    module: "packages/db/src/results-schema.ts",
    make: () => new TreatmentKeyError("the mode is blank"),
    code: "result_treatment_key",
  },
  {
    path: "the window, the lever pairs, the note or the declared metric (recordResult)",
    module: "packages/db/src/with-workspace.ts",
    make: () => new ResultInputError("observed_to is not after observed_from"),
    code: "result_input",
  },
  {
    path: "the generation is not this profile's (recordResult's scoped re-read)",
    module: "packages/db/src/with-workspace.ts",
    make: () => new ResultTargetError(),
    code: "result_target",
  },
  {
    path: "the same output, metric and window is already logged (the unique)",
    module: "packages/db/src/with-workspace.ts",
    make: () => new ResultDuplicateError(),
    code: "result_duplicate",
  },
  {
    path: "the caller's profile is not in this workspace (ProfileScope.mint)",
    module: "packages/db/src/with-workspace.ts",
    make: () => new ProfileAccessError(),
    code: "profile_access",
  },
  {
    path: "the workspace cannot be resolved (scopeForUser, BEFORE the write)",
    module: "app/(product)/workspace-scope.ts",
    make: () => new WorkspaceAccessError("belongs to 2 workspaces"),
    code: "workspace_access",
  },
  {
    path: "a forged scope reached a capability (the cage)",
    module: "packages/db/src/with-workspace.ts",
    make: () => new ScopeForgeryError("A WorkspaceScope"),
    code: "scope_forgery",
  },
];

describe("logResultAction: EVERY refusal reaches the creator with words", () => {
  it.each(THROWING_PATHS)(
    "$path → $code, with copy",
    async ({ make, code }) => {
      db.recordResult.mockRejectedValue(make());
      const state = await run(form());
      expect(state).toEqual({
        status: "refused",
        code,
        copy: BILLING_ERROR_COPY[code],
      });
      // The thing `8c-R15` is about: never the fallback.
      expect(state).not.toMatchObject({ code: "unknown" });
    }
  );

  it("the scope path refuses BEFORE the write, so nothing is attempted", async () => {
    // The entry a derivation from `results-ops.ts` would have missed
    // entirely: `scopeForUser` runs first, inside the same try.
    db.withWorkspace.mockRejectedValue(
      new WorkspaceAccessError("belongs to 2 workspaces")
    );
    const state = await run(form());
    expect(state).toMatchObject({ status: "refused", code: "workspace_access" });
    expect(db.recordResult).not.toHaveBeenCalled();
  });

  it("an UNRECOGNISED failure degrades to the fallback rather than throwing at a creator", async () => {
    // The honest floor. A driver error nobody typed a class for still has to
    // produce a rendered banner, not a stack trace on a screen.
    db.recordResult.mockRejectedValue(new Error("connection terminated"));
    const state = await run(form());
    expect(state).toMatchObject({
      status: "refused",
      code: "unknown",
      copy: BILLING_ERROR_COPY.unknown,
    });
  });

  it("NEXT CONTROL FLOW IS RE-THROWN, never turned into a refusal banner", async () => {
    // `rethrowNextControlFlow` is the first statement of the catch — asserted
    // in source by `action-gate.test.ts` and executed here. A swallowed
    // redirect renders "Something went wrong" over a navigation.
    db.recordResult.mockImplementation(async () => {
      redirect("/sign-in");
      throw new Error("unreachable");
    });
    let caught: (Error & { digest?: string }) | undefined;
    try {
      await run(form());
    } catch (err) {
      caught = err as Error & { digest?: string };
    }
    expect(caught?.digest).toMatch(/^NEXT_REDIRECT;/);
  });

  it("THE POPULATION HAS THREE SOURCES, and this list deliberately covers two", () => {
    // THE 2026-08-29 LESSON LANDING ON THIS FILE'S OWN GUARD. `THROWING_PATHS`
    // was built as two groups and was right about both; a THIRD appeared
    // afterwards and the list had no way to say it was not looking there.
    //
    //   1. the result WRITE path's own classes            (covered below)
    //   2. the shared scoping layer, before the write     (covered below)
    //   3. `@respin/brain`, on the comparison READ path   (NOT covered here)
    //
    // Group 3 does not belong in this list, and that is the point rather than
    // an excuse: `ComparisonInputError` is thrown at nine sites in
    // `buildLeverComparisons` and reaches a creator through `page.tsx`'s
    // `resultComparisons` read — it cannot arrive through `logResultAction`
    // at all. It is covered in `tests/results-page-wiring.test.tsx`, which
    // also records that its copy is written and NOT YET WIRED.
    //
    // This assertion exists so the list SAYS there are three sources rather
    // than silently having two. A fourth costs a line here.
    const SOURCES = [
      "the result write path's own refusal classes",
      "the shared scoping layer, before the write is reached",
      "@respin/brain, on the comparison read path (covered in results-page-wiring)",
    ];
    expect(SOURCES).toHaveLength(3);
    // The two this file covers are the two its entries name.
    const modules = new Set(THROWING_PATHS.map((p) => p.module));
    expect(modules.size).toBeGreaterThanOrEqual(2);
    expect(
      [...modules].some((m) => m.startsWith("packages/brain")),
      "a brain-path entry appeared in this list — it cannot reach this action; move it to the read-path suite"
    ).toBe(false);
  });

  it("NON-VACUITY: the population is a LIST, it is not empty, and it covers both groups", async () => {
    // A list that quietly emptied would make `it.each` above assert nothing.
    expect(THROWING_PATHS.length).toBeGreaterThanOrEqual(7);
    const modules = new Set(THROWING_PATHS.map((p) => p.module));
    // BOTH GROUPS ARE REPRESENTED: the write path's own classes, and the
    // shared scoping layer that runs before it. A population drawn from the
    // result modules alone is the 2026-08-29 defect, exactly.
    expect(modules).toContain("packages/db/src/results-schema.ts");
    expect(modules).toContain("app/(product)/workspace-scope.ts");
    expect(new Set(THROWING_PATHS.map((p) => p.code)).size).toBe(
      THROWING_PATHS.length
    );
  });
});
