import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { BILLING_ERROR_COPY, type BillingErrorCode } from "../app/(product)/billing-errors";

const state = vi.hoisted(() => ({
  requireUser: vi.fn(),
  scopeForUser: vi.fn(),
  generate: vi.fn(),
  trackedNicheEntitlementFor: vi.fn(),
  submitPastedReference: vi.fn(),
  trackNiche: vi.fn(),
  untrackNiche: vi.fn(),
  revalidatePath: vi.fn(),
  logSpend: vi.fn(),
  logRefusal: vi.fn(),
}));

vi.mock("@respin/auth", () => ({ requireUser: state.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidatePath }));
vi.mock("../app/(product)/workspace-scope", () => ({ scopeForUser: state.scopeForUser }));
// PARTIAL MOCKS, not replacements, and the difference is what slice 8c's
// close-out found. `actions.ts` now imports `BILLING_ERROR_COPY` as a VALUE
// (the paste action resolves a refusal's words on the server — see
// `paste-state.ts`'s `copy`), so importing it evaluates `billing-errors.ts`,
// whose `HANDLERS` table names ~40 error CLASSES from these two packages by
// reference. A whole-module replacement leaves every one of them undefined and
// the suite fails at collection with "No `AlreadySubscribedError` export is
// defined on the mock" — a failure about the mock, not about the code.
// `importOriginal` keeps the real classes (which is also what `billingErrorCode`
// needs, since it matches with `instanceof`) and overrides only the facade
// objects these tests drive.
vi.mock("@respin/credits/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/credits/app-server")>()),
  respinCredits: {
    generate: state.generate,
    trackedNicheEntitlementFor: state.trackedNicheEntitlementFor,
    submitPastedReference: state.submitPastedReference,
  },
}));
vi.mock("@respin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/db")>()),
  respinDb: {
    trackNiche: state.trackNiche,
    untrackNiche: state.untrackNiche,
  },
}));
vi.mock("../app/(product)/safe-log", () => ({ logSpend: state.logSpend, logRefusal: state.logRefusal }));

const { pasteReferenceAction, spinAction, trackNicheAction, untrackNicheAction } = await import("../app/(product)/trends/actions");
const SCOPE = { workspaceId: "ws_1", role: "owner" };

function nearCopyResult() {
  return {
    replayed: false,
    run: { status: "refused", killTest: { finalAttempt: { hardRules: [{ rule: "similarity" }] } } },
    creditsChargedNow: 2,
    balanceAfter: 8,
    configVersion: 1,
    resolvedTier: "creator",
    generation: {
      id: "generation_1", mode: "analyseAndSpin", outcome: "honest_refusal",
      promptBundleVersion: "bundle-v1", rewriteCount: 1,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.requireUser.mockResolvedValue({ id: "user_1" });
  state.scopeForUser.mockResolvedValue(SCOPE);
  state.generate.mockResolvedValue(nearCopyResult());
  state.trackedNicheEntitlementFor.mockResolvedValue({ maxTrackedNiches: 3 });
  state.trackNiche.mockResolvedValue({ id: "tracked_1" });
  state.untrackNiche.mockResolvedValue({ id: "tracked_1" });
  state.submitPastedReference.mockResolvedValue(pasteResult());
  state.logRefusal.mockReturnValue("unknown");
});

/**
 * `replayed` IS ITS OWN ARGUMENT, not derived from the price — which is the
 * whole point of the facade reporting it. The action used to compute
 * `creditsChargedNow === 0`, and this fixture could not express the case that
 * makes the two differ: a document pricing `creditCosts.autopsy` at 0, where a
 * creator's FIRST paste charges nothing and is not a replay.
 */
function pasteResult(
  creditsChargedNow = 4,
  replayed = false,
  claimStatus: "pending" | "completed" | "failed" | "parked" = "pending"
) {
  return {
    referenceInputId: "input_1",
    itemId: "item_1",
    claimId: "claim_1",
    claimStatus,
    autopsyId: null,
    creditsChargedNow,
    replayed,
    balanceAfter: 16,
    configVersion: 3,
  };
}

describe("Trends Spin action", () => {
  it("keeps the auth redirect above scope and generation", async () => {
    state.requireUser.mockImplementation(async () => {
      redirect("/sign-in");
      throw new Error("unreachable");
    });
    await expect(spinAction("profile_a", { status: "idle" }, new FormData())).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;/) });
    expect(state.scopeForUser).not.toHaveBeenCalled();
    expect(state.generate).not.toHaveBeenCalled();
  });

  it("hands credits only the bound profile, opaque autopsy id, and creator draft inputs", async () => {
    const form = new FormData();
    form.set("autopsyId", "opaque-autopsy-a");
    form.set("input", "My own angle");
    form.set("platform", "Short-form video");
    await expect(spinAction("profile_a", { status: "idle" }, form)).resolves.toEqual({
      status: "near_copy_refused", chargedCredits: 2,
    });
    expect(state.generate).toHaveBeenCalledTimes(1);
    const [scope, profileId, params] = state.generate.mock.calls[0];
    expect(scope).toBe(SCOPE);
    expect(profileId).toBe("profile_a");
    expect(params).toMatchObject({
      mode: "analyseAndSpin",
      spinAutopsyId: "opaque-autopsy-a",
      input: "My own angle",
      platform: "Short-form video",
    });
    expect(params).not.toHaveProperty("workspaceId");
    expect(params).not.toHaveProperty("niche");
    expect(params).not.toHaveProperty("reference");
    expect(params).not.toHaveProperty("price");
  });
});

const SENTINEL = "SENTINEL-CANDIDATE-TEXT-never-reaches-the-client";

function usableResult() {
  return {
    replayed: false,
    run: {
      status: "usable",
      output: {
        thesis: { statement: "Your own thesis, stated plainly", why: "the footage supports it" },
        hooks: [{ text: "A fresh hook in your own words", mechanic: "contradiction" }],
        beats: [{ atSeconds: 0, vo: "open on the take that failed", isTurn: false }],
        caption: { text: "A caption in your own words.", hashtags: ["filmmaking"] },
        whyThisPerforms: {
          reasoning: "SENTINEL-RATIONALE the model's own performance story",
          weakestPoint: "None of this has been checked against your own audience.",
        },
        disclosure: { platform: "Short-form video", guidance: "Say a tool helped draft this, in your own words." },
      },
      killTest: { outcome: "passed", finalAttempt: { hardRules: [] } },
    },
    creditsChargedNow: 2,
    balanceAfter: 8,
    configVersion: 1,
    resolvedTier: "creator",
    generation: {
      id: "generation_2", mode: "analyseAndSpin", outcome: "usable",
      promptBundleVersion: "bundle-v1", rewriteCount: 0,
    },
  };
}

function nonSimilarityRefusal() {
  return {
    replayed: false,
    run: {
      status: "refused",
      refusal: {
        headline: "This one did not survive the kill test, so it is not being shown.",
        // The `why` lines quote the candidate: they must NOT cross to the client.
        why: [`invented_specific at /hooks/0/text: ${SENTINEL} — Replace it with one you can point to.`],
        sharperAngle: "Try the angle your own material already supports.",
      },
      killTest: {
        outcome: "failed",
        finalAttempt: {
          // THE SHAPES ARE REAL `SPECIFIC_SHAPES` IDS (`@respin/modes`), so the
          // redacted locators this projection builds are the ones a creator
          // would actually read. The third is a claim family, which has no
          // noun here and locates by section alone.
          hardRules: [
            { rule: "invented_specific", shape: "month-date", field: "/hooks/0/text", excerpt: SENTINEL, remedy: "Replace it with one you can point to, or mark it [check]." },
            { rule: "invented_specific", shape: "plain-number", field: "/beats/0/vo", excerpt: SENTINEL, remedy: "Replace it with one you can point to, or mark it [check]." },
            { rule: "forbidden_claim", shape: "forecast", field: "/caption/text", excerpt: SENTINEL, remedy: "Say what the idea does, and name what is weakest about it." },
          ],
        },
      },
    },
    creditsChargedNow: 2,
    balanceAfter: 8,
    configVersion: 1,
    resolvedTier: "creator",
    generation: {
      id: "generation_3", mode: "analyseAndSpin", outcome: "honest_refusal",
      promptBundleVersion: "bundle-v1", rewriteCount: 1,
    },
  };
}

function spinForm() {
  const form = new FormData();
  form.set("autopsyId", "opaque-autopsy-a");
  form.set("input", "My own angle");
  form.set("platform", "Short-form video");
  return form;
}

describe("Trends Spin action projection (REQ-I04 / REQ-I05 / no candidate on refusal)", () => {
  it("a usable run carries the weakest point and disclosure guidance, and never the rationale", async () => {
    state.generate.mockResolvedValue(usableResult());
    const result = await spinAction("profile_a", { status: "idle" }, spinForm());
    expect(result).toEqual({
      status: "result",
      spinResult: [
        "Your own thesis, stated plainly",
        "A fresh hook in your own words",
        "open on the take that failed",
        "A caption in your own words.",
      ].join("\n"),
      weakestPoint: "None of this has been checked against your own audience.",
      disclosureGuidance: "Say a tool helped draft this, in your own words.",
      chargedCredits: 2,
    });
    expect(JSON.stringify(result)).not.toContain("SENTINEL-RATIONALE");
    expect(result).not.toHaveProperty("reasoning");
  });

  it("a non-similarity refusal carries rule ids, static remedies and the sharper angle — never candidate text", async () => {
    state.generate.mockResolvedValue(nonSimilarityRefusal());
    const result = await spinAction("profile_a", { status: "idle" }, spinForm());
    expect(result).toEqual({
      status: "withheld",
      chargedCredits: 2,
      // One entry per rule, pipeline order, the duplicate `invented_specific`
      // collapsed — but its two PLACES kept, redacted to shape and section
      // (round 2, compliance CHANGE 4). Without them the creator reads a
      // remedy about a token they cannot see, in a draft they cannot see.
      why: [
        {
          rule: "invented_specific",
          remedy: "Replace it with one you can point to, or mark it [check].",
          locators: ["a date in a hook", "a number in a beat"],
        },
        {
          rule: "forbidden_claim",
          remedy: "Say what the idea does, and name what is weakest about it.",
          locators: ["in the caption"],
        },
      ],
      sharperAngle: "Try the angle your own material already supports.",
    });
    // THE SENTINEL TEST: three findings and the refusal's `why` line all carry
    // the candidate excerpt, and none of it is in the returned shape. The
    // locators are built from `shape` and `field` only — `spinWithheldLocator`
    // has no excerpt parameter — so widening them cannot widen this.
    expect(JSON.stringify(result)).not.toContain(SENTINEL);
    expect(JSON.stringify(result)).not.toContain("excerpt");
    expect(JSON.stringify(result)).not.toContain("headline");
    // ...and no index into the withheld draft travels either: "a hook", never
    // "/hooks/0/text" and never "hook 1".
    expect(JSON.stringify(result)).not.toContain("/hooks/");
    expect(JSON.stringify(result)).not.toMatch(/hook \d/);
  });

  it("a rule that fires TWICE IN ONE SECTION reports that place once, and an unknown shape still locates by section", async () => {
    // The dedupe is per PLACE, not per finding: two invented specifics in the
    // same hook is one thing to look at, and saying it twice reads as two.
    const refusal = nonSimilarityRefusal();
    refusal.run.killTest.finalAttempt.hardRules = [
      { rule: "invented_specific", shape: "month-date", field: "/hooks/0/text", excerpt: SENTINEL, remedy: "Replace it with one you can point to, or mark it [check]." },
      { rule: "invented_specific", shape: "month-date", field: "/hooks/1/text", excerpt: SENTINEL, remedy: "Replace it with one you can point to, or mark it [check]." },
      { rule: "invented_specific", shape: "a_shape_this_screen_does_not_know", field: "/caption/text", excerpt: SENTINEL, remedy: "Replace it with one you can point to, or mark it [check]." },
    ];
    state.generate.mockResolvedValue(refusal);
    const result = await spinAction("profile_a", { status: "idle" }, spinForm());
    expect(result).toMatchObject({
      status: "withheld",
      why: [
        {
          rule: "invented_specific",
          locators: ["a date in a hook", "in the caption"],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(SENTINEL);
  });

  it("a near-copy refusal still takes its own branch and carries no reasons or excerpt", async () => {
    const nearCopy = nonSimilarityRefusal();
    nearCopy.run.killTest.finalAttempt.hardRules.push({
      rule: "similarity", shape: "hook", field: "/hooks", excerpt: SENTINEL, remedy: "Change the subject.",
    });
    state.generate.mockResolvedValue(nearCopy);
    const result = await spinAction("profile_a", { status: "idle" }, spinForm());
    expect(result).toEqual({ status: "near_copy_refused", chargedCredits: 2 });
    expect(JSON.stringify(result)).not.toContain(SENTINEL);
  });
});

describe("Trends niche action", () => {
  it("keeps the auth redirect above scope, tier resolution, and storage", async () => {
    state.requireUser.mockImplementation(async () => {
      redirect("/sign-in");
      throw new Error("unreachable");
    });
    await expect(
      trackNicheAction("profile_a", { status: "idle" }, new FormData())
    ).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;/) });
    expect(state.scopeForUser).not.toHaveBeenCalled();
    expect(state.trackedNicheEntitlementFor).not.toHaveBeenCalled();
    expect(state.trackNiche).not.toHaveBeenCalled();
  });

  it("resolves the allowance through the credits facade (config, R-95) and passes it to the scoped writer", async () => {
    const form = new FormData();
    form.set("niche", "  Home   cooking  ");
    await expect(
      trackNicheAction("profile_a", { status: "idle" }, form)
    ).resolves.toEqual({ status: "saved" });

    // The screen names no number and no tier: the facade is keyed on the
    // derived workspace and the clock, nothing the form could supply.
    expect(state.trackedNicheEntitlementFor).toHaveBeenCalledWith(SCOPE.workspaceId, expect.any(Date));
    expect(state.trackNiche).toHaveBeenCalledWith(
      SCOPE,
      "profile_a",
      "  Home   cooking  ",
      { maxTrackedNiches: 3 }
    );
    expect(state.revalidatePath).toHaveBeenCalledWith("/trends");
  });

  it("does not misreport a committed niche write as refused when revalidation fails", async () => {
    state.revalidatePath.mockImplementationOnce(() => {
      throw new Error("revalidation unavailable");
    });
    const form = new FormData();
    form.set("niche", "home cooking");
    await expect(
      trackNicheAction("profile_a", { status: "idle" }, form)
    ).rejects.toThrow(/revalidation unavailable/i);
    expect(state.trackNiche).toHaveBeenCalledTimes(1);
    expect(state.logRefusal).not.toHaveBeenCalled();
  });

  it("removes only the bound profile's opaque tracked-niche id", async () => {
    const form = new FormData();
    form.set("trackedNicheId", "tracked_1");
    await expect(
      untrackNicheAction("profile_a", { status: "idle" }, form)
    ).resolves.toEqual({ status: "removed" });
    expect(state.untrackNiche).toHaveBeenCalledWith(SCOPE, "profile_a", "tracked_1");
    // Removal needs no allowance: the facade read is not made at all.
    expect(state.trackedNicheEntitlementFor).not.toHaveBeenCalled();
    expect(state.revalidatePath).toHaveBeenCalledWith("/trends");
  });
});

// ------------------------- slice 8c, R13: the paste action

const PASTE_URL_SENTINEL = "https://example.com/SENTINEL-URL-never-logged";
const PASTE_TRANSCRIPT_SENTINEL = "SENTINEL-TRANSCRIPT another creator's words never logged";

function pasteForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("sourceUrl", PASTE_URL_SENTINEL);
  form.set("transcript", PASTE_TRANSCRIPT_SENTINEL);
  form.set("title", "A title");
  form.set("niche", "home cooking");
  for (const [k, v] of Object.entries(overrides)) form.set(k, v);
  return form;
}

/** Everything this test's two log mocks were handed as CONTEXT, as one string. */
function everythingLogged(): string {
  return JSON.stringify([
    ...state.logSpend.mock.calls.map(([, context]) => context),
    ...state.logRefusal.mock.calls.map(([, , context]) => context),
  ]);
}

describe("Trends paste action (R13, R-96/R-98)", () => {
  it("keeps the auth redirect above scope and the facade", async () => {
    state.requireUser.mockImplementation(async () => {
      redirect("/sign-in");
      throw new Error("unreachable");
    });
    await expect(
      pasteReferenceAction("profile_a", { status: "idle" }, pasteForm())
    ).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;/) });
    expect(state.scopeForUser).not.toHaveBeenCalled();
    expect(state.submitPastedReference).not.toHaveBeenCalled();
    expect(state.revalidatePath).not.toHaveBeenCalled();
  });

  it("hands the facade the bound profile and EXACTLY the four form fields", async () => {
    await expect(
      pasteReferenceAction("profile_a", { status: "idle" }, pasteForm())
    ).resolves.toEqual({
      status: "saved", claimId: "claim_1", creditsChargedNow: 4, balanceAfter: 16, replayed: false,
      claimStatus: "pending",
    });
    expect(state.submitPastedReference).toHaveBeenCalledTimes(1);
    const [scope, profileId, input] = state.submitPastedReference.mock.calls[0];
    expect(scope).toBe(SCOPE);
    expect(profileId).toBe("profile_a");
    // `toEqual`, not `toMatchObject`: no price, workspace id, tier or attempt
    // id rides along — the facade decides every one of those itself (R8).
    expect(input).toEqual({
      sourceUrl: PASTE_URL_SENTINEL,
      transcript: PASTE_TRANSCRIPT_SENTINEL,
      title: "A title",
      niche: "home cooking",
    });
  });

  it("omits a blank title and a blank niche rather than sending empty strings", async () => {
    await pasteReferenceAction("profile_a", { status: "idle" }, pasteForm({ title: "   ", niche: "" }));
    const [, , input] = state.submitPastedReference.mock.calls[0];
    expect(input).toEqual({ sourceUrl: PASTE_URL_SENTINEL, transcript: PASTE_TRANSCRIPT_SENTINEL });
    expect(input).not.toHaveProperty("title");
    expect(input).not.toHaveProperty("niche");
  });

  it("reports a paste that landed on an existing claim as replayed, charged nothing", async () => {
    state.submitPastedReference.mockResolvedValue(pasteResult(0, true));
    await expect(
      pasteReferenceAction("profile_a", { status: "idle" }, pasteForm())
    ).resolves.toEqual({
      status: "saved", claimId: "claim_1", creditsChargedNow: 0, balanceAfter: 16, replayed: true,
      claimStatus: "pending",
    });
  });

  it("a FIRST paste under a zero-priced document charges nothing and is NOT reported as replayed", async () => {
    // THE DEFECT THIS FLAG EXISTS FOR. `replayed` was derived here as
    // `creditsChargedNow === 0`, which is the same boolean only while
    // `creditCosts.autopsy` is above zero — and it is `z.number().int().min(0)`,
    // not `literal`, exactly as `creditCosts.onboardingBrainBuild` was when
    // R-82 found the same shape on the onboarding screen. Under a zero-priced
    // document the creator's first paste would have been told "Already queued —
    // nothing charged" about a reference that had just been created. The
    // facade now reports the fact instead of the screen inferring it.
    state.submitPastedReference.mockResolvedValue(pasteResult(0, false));
    await expect(
      pasteReferenceAction("profile_a", { status: "idle" }, pasteForm())
    ).resolves.toEqual({
      status: "saved", claimId: "claim_1", creditsChargedNow: 0, balanceAfter: 16, replayed: false,
      claimStatus: "pending",
    });
  });

  it("revalidates ONLY after a committed write, and never misreports a committed paste as refused", async () => {
    // Refused: nothing committed, nothing revalidated.
    state.submitPastedReference.mockRejectedValue(new Error("refused before any row"));
    await pasteReferenceAction("profile_a", { status: "idle" }, pasteForm());
    expect(state.revalidatePath).not.toHaveBeenCalled();

    // Committed, then revalidation fails: the failure propagates as its own
    // error and the creator is NOT told the paste was refused (the
    // `trackNicheAction` precedent).
    vi.clearAllMocks();
    state.requireUser.mockResolvedValue({ id: "user_1" });
    state.scopeForUser.mockResolvedValue(SCOPE);
    state.submitPastedReference.mockResolvedValue(pasteResult());
    state.revalidatePath.mockImplementationOnce(() => {
      throw new Error("revalidation unavailable");
    });
    await expect(
      pasteReferenceAction("profile_a", { status: "idle" }, pasteForm())
    ).rejects.toThrow(/revalidation unavailable/i);
    expect(state.submitPastedReference).toHaveBeenCalledTimes(1);
    expect(state.revalidatePath).toHaveBeenCalledWith("/trends");
    expect(state.logRefusal).not.toHaveBeenCalled();
  });

/**
 * The refused state the paste action returns: the code, the field when the form
 * has one, and THE WORDS THE ACTION RESOLVED. The copy travels in the state
 * because `paste-panel.tsx` is a client module and cannot import the map
 * (`paste-state.ts`'s `copy` docblock). Read from the same map the action reads,
 * so this asserts the action resolved the RIGHT entry rather than pinning a
 * sentence a test retyped.
 */
function refused(code: BillingErrorCode, field?: string) {
  return { status: "refused", code, copy: BILLING_ERROR_COPY[code], ...(field ? { field } : {}) };
}

  it("maps a refusal to its code and carries the refused FIELD, clamped to the form's closed set", async () => {
    class FieldRefusal extends Error {
      constructor(readonly field: string) {
        super(`refused ${field}: ${PASTE_TRANSCRIPT_SENTINEL}`);
      }
    }
    state.logRefusal.mockReturnValue("pasted_reference_transcript");
    state.submitPastedReference.mockRejectedValue(new FieldRefusal("transcript"));
    await expect(
      pasteReferenceAction("profile_a", { status: "idle" }, pasteForm())
    ).resolves.toEqual(refused("pasted_reference_transcript", "transcript"));

    // A field name this form does not have is dropped, not rendered.
    state.logRefusal.mockReturnValue("pasted_reference_input");
    state.submitPastedReference.mockRejectedValue(new FieldRefusal("<img onerror=1>"));
    await expect(
      pasteReferenceAction("profile_a", { status: "idle" }, pasteForm())
    ).resolves.toEqual(refused("pasted_reference_input"));

    // A refusal with no field at all (tier, balance, pause) carries none.
    state.logRefusal.mockReturnValue("insufficient_credits");
    state.submitPastedReference.mockRejectedValue(new Error("balance"));
    await expect(
      pasteReferenceAction("profile_a", { status: "idle" }, pasteForm())
    ).resolves.toEqual(refused("insufficient_credits"));
  });

  it("a code that is NOT in the copy map is clamped to `unknown`, never rendered as undefined copy (C8)", async () => {
    // THE DEFECT: `logRefusal` is typed `string` — `safeLogFields` degrades to
    // the plain literal `"unknown"` when `billingErrorCode` itself throws — and
    // the action re-asserted that string as a `BillingErrorCode` with a CAST,
    // then indexed `BILLING_ERROR_COPY` with it. An unrecognised value yields
    // `undefined`, and `PasteOutcome` reads `copy.title`: a client-side throw
    // ON THE REFUSAL PATH, i.e. the path a creator is already on because
    // something went wrong. Every other consumer in `app/**` goes through the
    // clamp; this one now does too.
    state.submitPastedReference.mockRejectedValue(new Error("refused"));
    for (const rogue of ["not_a_billing_error_code", "", "__proto__", "toString"]) {
      state.logRefusal.mockReturnValue(rogue);
      const outcome = await pasteReferenceAction("profile_a", { status: "idle" }, pasteForm());
      expect(outcome, rogue).toEqual(refused("unknown"));
      // The words are REAL words, not `undefined` — which is the throw.
      expect(outcome.status === "refused" && outcome.copy.title.length, rogue).toBeGreaterThan(0);
    }
    // NON-VACUITY: a code that IS in the map is still passed through, so the
    // clamp is not simply flattening everything to `unknown`.
    state.logRefusal.mockReturnValue("workspace_paused");
    await expect(
      pasteReferenceAction("profile_a", { status: "idle" }, pasteForm())
    ).resolves.toEqual(refused("workspace_paused"));
  });

  it("carries the CLAIM STATUS the facade reported, so the panel does not say 'queued' about a parked claim (C6)", async () => {
    for (const claimStatus of ["pending", "completed", "failed", "parked"] as const) {
      state.submitPastedReference.mockResolvedValue(pasteResult(0, true, claimStatus));
      await expect(
        pasteReferenceAction("profile_a", { status: "idle" }, pasteForm())
      ).resolves.toEqual({
        status: "saved", claimId: "claim_1", creditsChargedNow: 0, balanceAfter: 16, replayed: true,
        claimStatus,
      });
    }
  });

  it("logs ids and numbers only — never the transcript or the URL, on the spend path or the refusal path", async () => {
    await pasteReferenceAction("profile_a", { status: "idle" }, pasteForm());
    expect(state.logSpend).toHaveBeenCalledWith(
      "[trends-paste] reference queued",
      {
        workspaceId: SCOPE.workspaceId, profileId: "profile_a",
        referenceInputId: "input_1", itemId: "item_1", claimId: "claim_1", claimStatus: "pending",
        creditsChargedNow: 4, balanceAfter: 16, configVersion: 3,
      }
    );
    state.submitPastedReference.mockRejectedValue(new Error(`refused: ${PASTE_TRANSCRIPT_SENTINEL} ${PASTE_URL_SENTINEL}`));
    await pasteReferenceAction("profile_a", { status: "idle" }, pasteForm());
    expect(state.logRefusal).toHaveBeenCalledTimes(1);
    const logged = everythingLogged();
    expect(logged).not.toContain("SENTINEL-TRANSCRIPT");
    expect(logged).not.toContain("SENTINEL-URL");
    expect(logged).not.toContain("example.com");
    // NON-VACUITY: the sentinels really were in the form the action read.
    expect(pasteForm().get("transcript")).toContain("SENTINEL-TRANSCRIPT");
  });
});
