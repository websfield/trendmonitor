import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1", email: "anna@example.test", name: "Anna" },
  scope: { workspaceId: "workspace-1", role: "editor" },
  requireUser: vi.fn(),
  scopeForUser: vi.fn(),
}));

vi.mock("@respin/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("../app/(product)/workspace-scope", () => ({
  scopeForUser: mocks.scopeForUser,
}));

import {
  BRAIN_EDIT_MAX_FIELDS,
  BRAIN_EDIT_POINTER_MAX,
  BRAIN_EDIT_TOTAL_MAX,
  BRAIN_EDIT_VALUE_MAX,
  ReferenceEchoError,
  respinDb,
} from "@respin/db";
import {
  editBrainDocumentAction,
  editDeclaredMetricAction,
} from "../app/(product)/brain/actions";
import { BrainEditRefusal } from "../app/(product)/brain/edit-form";
import { BILLING_ERROR_COPY } from "../app/(product)/billing-errors";
import {
  ECHO_NO_GUARANTEE_CLAUSE,
  NOTHING_SAVED_CLAUSE,
} from "../app/(product)/refusal-clauses";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(mocks.user);
  mocks.scopeForUser.mockResolvedValue(mocks.scope);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The rendered markup as a READER sees it — React escapes `'` to `&#x27;`, so
 * a copy assertion made against the source constant fails on the apostrophe in
 * "a reference post's own wording" while the sentence is perfectly present.
 * Decoded rather than escaped on the expectation side, so the test compares the
 * constant itself and not a second hand-escaped copy of it.
 */
function readableText(html: string): string {
  return html
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function redirectDigest(action: Promise<unknown>): Promise<string | undefined> {
  try {
    await action;
  } catch (error) {
    return (error as { digest?: string }).digest;
  }
  return undefined;
}

describe("the ordinary Brain edit refusal reaches actionable screen copy", () => {
  it("returns a bounded structured reference match to the form without putting reference text in a redirect", async () => {
    const matchedSpan = "build the tension slowly then reveal the useful answer";
    const referenceInputId = "00000000-0000-7000-8000-000000000099";
    vi.spyOn(respinDb, "editBrainDocument").mockRejectedValueOnce(
      new ReferenceEchoError("attacker-controlled reference detail", {
        pointer: "/register",
        inputId: referenceInputId,
        span: matchedSpan,
      })
    );
    const formData = new FormData();
    formData.set("edit:/register", "A replacement written in my own words.");

    const state = await editBrainDocumentAction(
      "profile-1",
      "brain-v1",
      null,
      formData
    );

    expect(respinDb.editBrainDocument).toHaveBeenCalledWith(
      mocks.scope,
      "profile-1",
      "brain-v1",
      [{ pointer: "/register", value: "A replacement written in my own words." }]
    );
    expect(state).toEqual({
      kind: "reference_echo",
      pointer: "/register",
      referenceInputId,
      matchedSpan,
      matchedSpanTruncated: false,
    });
    if (state === null) throw new Error("expected structured reference-echo state");
    const html = renderToStaticMarkup(
      <BrainEditRefusal
        state={state}
        fieldLabels={{ "/register": "Voice and register" }}
      />
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Voice and register");
    expect(html).toContain(referenceInputId);
    expect(html).toContain(matchedSpan);
    expect(html).toMatch(/rewrite this field in your own words/i);
    expect(html).not.toContain("attacker-controlled reference detail");
    // G2 — THE TWO CLAUSES THE IN-FORM BANNER USED TO ROUTE AROUND. Asserted
    // against the SHARED constants, so a banner that stops rendering one, or a
    // `billing-errors.ts` that rewrites one, fails here rather than silently
    // leaving the two refusal surfaces saying different things.
    expect(readableText(html)).toContain(NOTHING_SAVED_CLAUSE);
    expect(readableText(html)).toContain(ECHO_NO_GUARANTEE_CLAUSE);
  });

  // The other half of G2: the `?e=` copy for the SAME refusal is COMPOSED from
  // the same two constants rather than repeating them, which is what makes the
  // assertion above a shared-source check instead of two coincidences.
  it("G2: the redirect copy and the in-form banner carry the SAME two clauses", () => {
    const detail = BILLING_ERROR_COPY.reference_echo.detail;
    expect(detail).toContain(NOTHING_SAVED_CLAUSE);
    expect(detail).toContain(ECHO_NO_GUARANTEE_CLAUSE);
    // REQ-I04 in its own right: the disclaimer must still refuse the promise,
    // not merely be present under a name that could be softened to a claim.
    expect(ECHO_NO_GUARANTEE_CLAUSE).toMatch(/does not promise/i);
    expect(ECHO_NO_GUARANTEE_CLAUSE).not.toMatch(/\bguarantee[sd]\b/i);
    // N2 — THE SAME PIN FOR THE OTHER CLAUSE, which had none. Every assertion
    // in this file reads `NOTHING_SAVED_CLAUSE` and compares it against
    // itself, so softening it to "Your draft may not have been saved." would
    // keep the whole suite green — the self-referential class this slice has
    // already been caught by twice. A creator who has just been refused needs
    // a FACT about their work, not a hedge.
    expect(NOTHING_SAVED_CLAUSE).toMatch(/nothing was saved/i);
    expect(NOTHING_SAVED_CLAUSE).not.toMatch(
      /\b(?:may|might|should|could|probably|likely|possibly|perhaps)\b/i
    );
  });

  it("bounds the untrusted matched excerpt returned to the client", async () => {
    vi.spyOn(respinDb, "editBrainDocument").mockRejectedValueOnce(
      new ReferenceEchoError("attacker-controlled reference detail", {
        pointer: "/register",
        inputId: "00000000-0000-7000-8000-000000000099",
        span: "word ".repeat(500),
      })
    );
    const formData = new FormData();
    formData.set("edit:/register", "A replacement written in my own words.");

    const state = await editBrainDocumentAction(
      "profile-1",
      "brain-v1",
      null,
      formData
    );

    expect(state?.kind).toBe("reference_echo");
    expect(state?.matchedSpan.length).toBeLessThanOrEqual(240);
    expect(state?.matchedSpanTruncated).toBe(true);
  });

  it("refuses too many edit fields before obtaining a workspace scope", async () => {
    const edit = vi.spyOn(respinDb, "editBrainDocument");
    const formData = new FormData();
    for (let index = 0; index <= BRAIN_EDIT_MAX_FIELDS; index += 1) {
      formData.append(`edit:/rules/${index}`, "short");
    }

    const digest = await redirectDigest(
      editBrainDocumentAction("profile-1", "brain-v1", null, formData)
    );
    expect(digest).toContain("/brain?e=brain_edit_limit");
    expect(mocks.scopeForUser).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it("refuses an oversized normalized pointer before obtaining a workspace scope", async () => {
    const edit = vi.spyOn(respinDb, "editBrainDocument");
    const formData = new FormData();
    formData.set(`edit:/${"p".repeat(BRAIN_EDIT_POINTER_MAX)}`, "short");

    const digest = await redirectDigest(
      editBrainDocumentAction("profile-1", "brain-v1", null, formData)
    );
    expect(digest).toContain("/brain?e=brain_edit_limit");
    expect(mocks.scopeForUser).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it("refuses an oversized normalized value before obtaining a workspace scope", async () => {
    const edit = vi.spyOn(respinDb, "editBrainDocument");
    const formData = new FormData();
    formData.set("edit:/register", "v".repeat(BRAIN_EDIT_VALUE_MAX + 1));

    const digest = await redirectDigest(
      editBrainDocumentAction("profile-1", "brain-v1", null, formData)
    );
    expect(digest).toContain("/brain?e=brain_edit_limit");
    expect(mocks.scopeForUser).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it("refuses an oversized aggregate before obtaining a workspace scope", async () => {
    const edit = vi.spyOn(respinDb, "editBrainDocument");
    const formData = new FormData();
    const fieldCount = Math.floor(BRAIN_EDIT_TOTAL_MAX / BRAIN_EDIT_VALUE_MAX);
    for (let index = 0; index < fieldCount; index += 1) {
      formData.append(`edit:/rules/${index}`, "v".repeat(BRAIN_EDIT_VALUE_MAX));
    }

    const digest = await redirectDigest(
      editBrainDocumentAction("profile-1", "brain-v1", null, formData)
    );
    expect(digest).toContain("/brain?e=brain_edit_limit");
    expect(mocks.scopeForUser).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it("applies the same value bound to the structured metric action", async () => {
    const edit = vi.spyOn(respinDb, "editDeclaredMetric");
    const formData = new FormData();
    formData.set("metric:label", "v".repeat(BRAIN_EDIT_VALUE_MAX + 1));
    formData.set("metric:unit", "seconds");
    formData.set("metric:direction", "higher_is_better");

    const digest = await redirectDigest(
      editDeclaredMetricAction("profile-1", "brain-v1", null, formData)
    );
    expect(digest).toContain("/brain?e=brain_edit_limit");
    expect(mocks.scopeForUser).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it("allows exactly the shared field-count boundary through to the facade", async () => {
    const edit = vi
      .spyOn(respinDb, "editBrainDocument")
      .mockResolvedValueOnce({} as never);
    const formData = new FormData();
    for (let index = 0; index < BRAIN_EDIT_MAX_FIELDS; index += 1) {
      formData.append(`edit:/rules/${index}`, "x");
    }

    const digest = await redirectDigest(
      editBrainDocumentAction("profile-1", "brain-v1", null, formData)
    );
    expect(digest).toContain("/brain;");
    expect(mocks.scopeForUser).toHaveBeenCalledWith(mocks.user);
    expect(edit).toHaveBeenCalledOnce();
  });

  it("counts value length after NFC normalization, like the DB authority", async () => {
    const edit = vi
      .spyOn(respinDb, "editBrainDocument")
      .mockResolvedValueOnce({} as never);
    const formData = new FormData();
    const decomposed = "e\u0301".repeat(BRAIN_EDIT_VALUE_MAX);
    formData.set("edit:/register", decomposed);

    const digest = await redirectDigest(
      editBrainDocumentAction("profile-1", "brain-v1", null, formData)
    );
    expect(digest).toContain("/brain;");
    expect(edit).toHaveBeenCalledWith(
      mocks.scope,
      "profile-1",
      "brain-v1",
      [{ pointer: "/register", value: decomposed }]
    );
  });
});
