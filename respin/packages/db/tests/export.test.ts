// REQ-A04's export, witnessed on THE PATH `/api/export` REACHES.
//
// This suite used to drive `exportBrain`/`exportBrainFile` — a second,
// materialising exporter with zero `app/**` callers. R11's registry walk, R12's
// pause exemption, R13's same-workspace sibling case and R15's private-only
// `frameworks` rule were every one of them asserted against code no user path
// could run, and the tenancy gate proved the consequence by planting: M1 stayed
// GREEN and M7 SURVIVED (2026-08-31). The dead implementation is gone and every
// case below goes through `openBrainExport`, which is what `respinDb`
// binds and what the route calls.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { pausePeriods } from "../src/billing-schema";
import { brainDocs, creatorProfiles, frameworks } from "../src/brain-schema";
import {
  brainActivationSnapshots,
  onboardingInterviewDrafts,
} from "../src/onboarding-schema";
import {
  generationAttempts,
  generationFeedback,
  generations,
} from "../src/generation-schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import {
  ProfileScope,
  PROFILE_EXPORT_TABLES,
  withWorkspace,
  writeCapabilities,
  type SourceEvidenceEntry,
  type WorkspaceScope,
} from "../src/with-workspace";
import { ExportBusyError, ProfileAccessError } from "../src/errors";
import { editBrainDocument } from "../src/brain-ops";
import { CHECK } from "../src/brain-content";
import {
  CREATOR_DATA_REGISTRY,
  type CreatorDataEntry,
} from "../src/creator-data-registry";
import type { RunSlots } from "../src/run-slot";
import {
  BRAIN_KIND_LABELS,
  BRAIN_STATUS_LABELS,
  EXPORT_EVIDENCE_UNVERIFIED,
  EXPORT_STREAM_DEADLINE_MS,
  INTERVIEW_PLACEHOLDER_ABSENCE,
  KILLTEST_FIELD_LABELS,
  METRIC_DIRECTION_LABELS,
  NO_RULES_RECORDED,
  PLACEHOLDER_ABSENCE,
  STRATEGY_FIELD_LABELS,
  STRATEGY_METRIC_FIELD_LABELS,
  VOICE_FIELD_LABELS,
  ExportClassificationError,
  exportAbsenceSentence,
  exportClaimHeading,
  exportPlan,
  openBrainExport,
  quoteIntro,
  EXPORT_MARKDOWN_NOT_IMPORTABLE,
  EXPORT_MARKDOWN_SCOPE,
} from "../src/export";

/** This package's `src`, for the one source-shape assertion below. */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

/**
 * THE STORED SENTENCES, AS LITERALS — `renderBrainReason`'s two live shapes.
 *
 * The (kind, reason) absence selection is driven from these rather than from
 * `renderBrainReason` itself: a test that computes its input from the same
 * function the guard reads moves with a mutation and stays green. The round
 * trip between the renderer and the classifier is proved separately and
 * generatively, in `brain-reason.test.ts`.
 */
const REASON_INFERRED = "Version 1: inferred from 3 of your onboarding inputs.";
const REASON_EDITED = "Version 2: you edited this document.";

async function collect(chunks: AsyncIterable<string>): Promise<string> {
  let value = "";
  for await (const chunk of chunks) value += chunk;
  return value;
}

/** The registry's own answer, recomputed here rather than restated. */
const INCLUDED_TABLES = CREATOR_DATA_REGISTRY.filter(
  (entry) => entry.export.included
).map((entry) => entry.table);

/**
 * One `creator_authored` payload plus the evidence entries that index into it.
 *
 * The offsets are REAL offsets into a REAL stored string, which is what
 * `validateSourceEvidence` requires and what makes the quote in the export the
 * creator's own bytes rather than a copy of them.
 */
function authored(
  pairs: readonly (readonly [string, string])[]
): { content: string; entries: Omit<SourceEvidenceEntry, "inputId">[] } {
  let content = "";
  const entries: Omit<SourceEvidenceEntry, "inputId">[] = [];
  for (const [field, value] of pairs) {
    const startUtf16 = content.length;
    content += value;
    entries.push({ field, quote: value, startUtf16, endUtf16: content.length });
    content += "\n";
  }
  return { content, entries };
}

describe("REQ-A04 brain export", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "export_user");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "export_user", name: "A" })
    ).workspace.id;
    const [profile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "Anna" })
      .returning();
    profileId = profile.id;
  });

  const jsonExport = async (
    scope: WorkspaceScope,
    id = profileId
  ): Promise<{ tables: Record<string, unknown[]>; annotations: unknown[]; registry: unknown[] }> =>
    JSON.parse(await collect(await openBrainExport(db, scope, id, "json"))) as {
      tables: Record<string, unknown[]>;
      annotations: unknown[];
      registry: unknown[];
    };

  const markdownExport = async (
    scope: WorkspaceScope,
    id = profileId
  ): Promise<string> =>
    collect(await openBrainExport(db, scope, id, "markdown"));

  async function seedVoice(): Promise<{
    workspaceScope: WorkspaceScope;
    input: { id: string; content: string };
    doc: { id: string };
  }> {
    const workspaceScope = await withWorkspace(db, { authUserId: "export_user" });
    const profileScope = await ProfileScope.mint(db, workspaceScope, profileId);
    const caps = writeCapabilities(profileScope);
    const input = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: "I write directly",
    });
    const evidence: SourceEvidenceEntry[] = [
      {
        field: "/register",
        quote: input.content,
        inputId: input.id,
        startUtf16: 0,
        endUtf16: input.content.length,
      },
    ];
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "voice",
          content: {
            register: "Direct",
            sentenceRhythm: "[check]",
            signatureMoves: [],
            avoid: [],
          },
          sourceEvidence: evidence,
          reason: { code: "onboarding_inference" },
        },
        tx
      )
    );
    return { workspaceScope, input, doc };
  }

  /**
   * A STRATEGY document with a `[check]` position and a `creator_authored`
   * warrant — the fixture this suite did not have, and the reason a kind-blind
   * absence sentence and a missing provenance line survived a mutation pass AND
   * a browser walk. The suite seeded `voice` only.
   */
  async function seedStrategy(
    workspaceScope: WorkspaceScope,
    forProfileId = profileId
  ): Promise<{ inputId: string; postedAt: Date }> {
    const profileScope = await ProfileScope.mint(db, workspaceScope, forProfileId);
    const caps = writeCapabilities(profileScope);
    const { content, entries } = authored([
      ["/positioning", "The blunt one in a polite niche"],
      ["/metric/label", "Newsletter signups"],
      ["/metric/unit", "people"],
      ["/metric/direction", "higher_is_better"],
    ]);
    const input = await caps.appendOnboardingInput({
      inputClass: "creator_authored",
      content,
      fieldKey: "creator_edit",
    });
    await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "strategy",
          content: {
            // DELIBERATELY UNDECIDED: the creator was asked and left it open.
            audience: "[check]",
            positioning: "The blunt one in a polite niche",
            pillars: [],
            metric: {
              key: "newsletter-signups",
              label: "Newsletter signups",
              unit: "people",
              direction: "higher_is_better",
            },
          },
          sourceEvidence: entries.map((entry) => ({ ...entry, inputId: input.id })),
          // WHAT `interview-ops.ts` ACTUALLY WRITES (`STRATEGY_REASON`): an
          // interview-built Strategy version is `onboarding_inference` whose
          // evidence rows are `creator_authored` interview answers. The
          // fixture carried `creator_edit`, which contradicted its own
          // "DELIBERATELY UNDECIDED: the creator was asked" comment — and once
          // the absence sentence is selected by (kind, reason) that mismatch
          // stops being cosmetic. The creator-edit case gets its own fixture
          // below rather than riding on this one.
          reason: { code: "onboarding_inference" },
        },
        tx
      )
    );
    return { inputId: input.id, postedAt: input.createdAt };
  }

  /** A KILL TEST document, same shape of gap: one stated rule, one undecided. */
  async function seedKillTest(workspaceScope: WorkspaceScope): Promise<void> {
    const profileScope = await ProfileScope.mint(db, workspaceScope, profileId);
    const caps = writeCapabilities(profileScope);
    const { content, entries } = authored([["/rules/0", "Never fake a receipt"]]);
    const input = await caps.appendOnboardingInput({
      inputClass: "creator_authored",
      content,
      fieldKey: "creator_edit",
    });
    await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "killtest",
          content: {
            rules: ["Never fake a receipt", "[check]"],
            bannedWords: [],
          },
          sourceEvidence: entries.map((entry) => ({ ...entry, inputId: input.id })),
          // Same as `seedStrategy`: `KILLTEST_REASON` in interview-ops.ts.
          reason: { code: "onboarding_inference" },
        },
        tx
      )
    );
  }

  /**
   * A VOICE version the CREATOR EDITED, with one position they set to
   * `[check]` themselves — the population the compliance gate's round-2 CHANGE
   * names. `editBrainDocument` accepts `[check]` for a field and drops that
   * field's evidence (`brain-edit.test.ts`, "allows [check] for one field,
   * drops its warrant"), so the stored row is a `voice` document whose
   * `[check]` is the creator's own deliberate decision and whose reason is
   * `creator_edit`.
   */
  async function seedEditedVoice(
    workspaceScope: WorkspaceScope,
    doc: { id: string }
  ): Promise<void> {
    await editBrainDocument(db, workspaceScope, profileId, doc.id, [
      { pointer: "/register", value: CHECK },
      { pointer: "/sentenceRhythm", value: "Short, then shorter." },
    ]);
  }

  // -------------------------------------------------------------------- R11

  it("R11: the streamed JSON's table keys ARE the registry's included set, in registry order", async () => {
    const { workspaceScope } = await seedVoice();
    const parsed = await jsonExport(workspaceScope);

    // Equality, not containment, and ORDER, not just membership: a hard-coded
    // list is only caught by a comparison the registry itself supplies. The
    // non-vacuity is one line down — the registry really does exclude some
    // tables, so this is not `everything === everything`.
    expect(Object.keys(parsed.tables)).toEqual(INCLUDED_TABLES);
    expect(
      CREATOR_DATA_REGISTRY.length,
      "the registry excludes nothing, so the key-set comparison is vacuous"
    ).toBeGreaterThan(INCLUDED_TABLES.length);
    // ...and every included table has a reader that ran, rather than a key
    // emitted with an empty array because nothing was asked.
    expect(parsed.tables.creator_profiles).toHaveLength(1);
    expect(parsed.tables.brain_docs).toHaveLength(1);
    expect(parsed.tables.onboarding_inputs).toHaveLength(1);
  });

  it("R11: every table the reader can page is registered, so no reader is orphaned", () => {
    for (const table of PROFILE_EXPORT_TABLES) {
      const entry = CREATOR_DATA_REGISTRY.find((e) => e.table === table);
      expect(entry, `${table} has an export reader but no registry entry`).toBeDefined();
      expect(
        entry?.export.included,
        `${table} has an export reader but is registered as excluded`
      ).toBe(true);
    }
    expect(exportPlan()).toEqual(INCLUDED_TABLES);
  });

  it("R11 NON-VACUITY: a registered included table with no reader is refused", () => {
    const planted: CreatorDataEntry = {
      table: "future_creator_rows",
      holdsCreatorContent: true,
      export: { included: true, reason: "A planted future creator-data table for the guard." },
      deletion: { behaviour: "cascade", reason: "A planted deletion decision for the guard." },
    };
    expect(() => exportPlan([planted])).toThrow(/future_creator_rows/);
    expect(() => exportPlan([planted])).toThrow(ExportClassificationError);
    // ...and an EXCLUDED unclassifiable table is not refused: the guard is
    // about readers for rows we promised to hand over, not about the registry
    // being a subset of the reader map.
    expect(() =>
      exportPlan([{ ...planted, export: { included: false, reason: "planted" } }])
    ).not.toThrow();
  });

  it("R11 FAIL-CLOSED BEFORE HEADERS: an unreadable included table refuses without opening a stream", async () => {
    const { workspaceScope } = await seedVoice();
    // The registry is `readonly` to TypeScript and a plain array at runtime.
    // Pushing into it is the only way to drive the class this guard exists
    // for — a slice-6/8/9 table registered for export before its reader lands.
    const mutable = CREATOR_DATA_REGISTRY as CreatorDataEntry[];
    const planted: CreatorDataEntry = {
      table: "future_creator_rows",
      holdsCreatorContent: true,
      export: { included: true, reason: "A planted future creator-data table for the guard." },
      deletion: { behaviour: "cascade", reason: "A planted deletion decision for the guard." },
    };
    const transaction = vi.spyOn(db, "transaction");
    let acquireCalls = 0;
    const slots: RunSlots = {
      async acquire() {
        acquireCalls += 1;
        return { granted: false, reason: "workspace_limit" };
      },
    };
    mutable.push(planted);
    try {
      await expect(
        openBrainExport(db, workspaceScope, profileId, "json", slots)
      ).rejects.toBeInstanceOf(ExportClassificationError);
    } finally {
      mutable.splice(mutable.indexOf(planted), 1);
    }
    expect(
      acquireCalls,
      "the refusal must land before a session slot is taken"
    ).toBe(0);
    expect(
      transaction,
      "the refusal must land before any row is read — a body that dies mid-download is a truncated file, not a refusal"
    ).not.toHaveBeenCalled();
    // The registry is intact for every other case in this file.
    expect(exportPlan()).toEqual(INCLUDED_TABLES);
  });

  // --------------------------------------------------------------- R9 / R10

  it("R9: annotates an unreadable quote and completes both formats", async () => {
    const { workspaceScope, doc } = await seedVoice();
    const [stored] = await db.select().from(brainDocs).where(eq(brainDocs.id, doc.id));
    const [entry] = stored.sourceEvidence as SourceEvidenceEntry[];
    await db
      .update(brainDocs)
      .set({ sourceEvidence: [{ ...entry, quote: "not in the stored post" }] })
      .where(eq(brainDocs.id, doc.id));

    const parsed = await jsonExport(workspaceScope);
    expect(parsed.annotations).toContainEqual(
      expect.objectContaining({ brainDocId: doc.id, message: EXPORT_EVIDENCE_UNVERIFIED })
    );
    expect(await markdownExport(workspaceScope)).toContain(EXPORT_EVIDENCE_UNVERIFIED);
  });

  it("R9: annotates null and non-object evidence as an unknown claim instead of throwing", async () => {
    const { workspaceScope, doc } = await seedVoice();
    await db
      .update(brainDocs)
      .set({
        sourceEvidence: [null, "bad evidence"] as unknown as SourceEvidenceEntry[],
      })
      .where(eq(brainDocs.id, doc.id));

    const parsed = await jsonExport(workspaceScope);
    expect(parsed.annotations).toEqual([
      {
        brainDocId: doc.id,
        pointer: "(unknown claim)",
        message: EXPORT_EVIDENCE_UNVERIFIED,
      },
      {
        brainDocId: doc.id,
        pointer: "(unknown claim)",
        message: EXPORT_EVIDENCE_UNVERIFIED,
      },
    ]);
  });

  it("R10: an empty claim array renders a named absence, never 0", async () => {
    const { workspaceScope } = await seedVoice();
    const markdown = await markdownExport(workspaceScope);
    expect(markdown).toContain(NO_RULES_RECORDED);
    expect(markdown).toContain(`### ${VOICE_FIELD_LABELS.signatureMoves}`);
    expect(markdown).not.toMatch(/^0$/m);
  });

  // ---------------------------------------------------- F3: whose absence is it

  it("F3: a VOICE placeholder says our search came up empty; the file offers no control", async () => {
    const { workspaceScope } = await seedVoice();
    const markdown = await markdownExport(workspaceScope);
    expect(markdown).toContain(exportAbsenceSentence("voice", REASON_INFERRED));
    // PINNED TO THE WORDS as well, not only to the function's own return
    // value: an assertion that reads the constant it is checking moves with a
    // mutation and stays green (the same correction the KILL TEST case below
    // records making).
    expect(markdown.toLowerCase()).toContain("could not point to a quote");
    // The screen's sentence ends in a control ("Confirm it as still unknown").
    // A downloaded file has no such control, so the projection drops it.
    expect(markdown).not.toContain(PLACEHOLDER_ABSENCE);
    expect(markdown).not.toMatch(/Confirm it as still/);
  });

  it("F3: a STRATEGY placeholder says the creator left it undecided, not that we could not find it", async () => {
    const { workspaceScope } = await seedVoice();
    await seedStrategy(workspaceScope);
    const markdown = await markdownExport(workspaceScope);

    // PER SECTION, not per file: this profile has a voice document too, whose
    // own ungrounded field legitimately carries the voice sentence. A
    // whole-file assertion would pass on a kind-blind renderer the moment the
    // fixture contained a voice doc — which is the shape that let this defect
    // survive. Both sections are checked, in the same run, against each other.
    const section = (kindLabel: string): string => {
      const start = markdown.indexOf(`## ${kindLabel} `);
      expect(start, `no ${kindLabel} section in the export`).toBeGreaterThan(-1);
      const next = markdown.indexOf("\n## ", start + 1);
      return next === -1 ? markdown.slice(start) : markdown.slice(start, next);
    };
    const strategy = section(BRAIN_KIND_LABELS.strategy);
    const voice = section(BRAIN_KIND_LABELS.voice);

    expect(strategy).toContain(exportAbsenceSentence("strategy", REASON_INFERRED));
    // THE DEFECT, stated as an assertion: `/audience` is undecided because the
    // creator declined to decide it. Nobody searched their posts for it, so
    // the voice sentence would misattribute their own choice to a failed
    // search of ours (REQ-I03).
    expect(strategy).not.toContain(exportAbsenceSentence("voice", REASON_INFERRED));
    expect(voice).toContain(exportAbsenceSentence("voice", REASON_INFERRED));
    expect(voice).not.toContain(
      exportAbsenceSentence("strategy", REASON_INFERRED)
    );
    // Neither section carries a call to action a downloaded file cannot offer.
    expect(markdown).not.toContain(PLACEHOLDER_ABSENCE);
    expect(markdown).not.toContain(INTERVIEW_PLACEHOLDER_ABSENCE);
  });

  it("F3: a KILL TEST placeholder uses the interview sentence too", async () => {
    const { workspaceScope } = await seedVoice();
    await seedKillTest(workspaceScope);
    const markdown = await markdownExport(workspaceScope);
    const start = markdown.indexOf(`## ${BRAIN_KIND_LABELS.killtest} `);
    expect(start, "no Kill Test section in the export").toBeGreaterThan(-1);
    const next = markdown.indexOf("\n## ", start + 1);
    const killtest = next === -1 ? markdown.slice(start) : markdown.slice(start, next);

    // PINNED TO THE WORDS, not to `exportAbsenceSentence`'s own return value:
    // an assertion that reads the constant it is checking moves WITH a
    // kind-blind mutation and stays green. Planted and observed — this case
    // survived until the phrases below replaced the round-trip.
    expect(killtest).toContain(exportAbsenceSentence("killtest", REASON_INFERRED));
    expect(killtest.toLowerCase()).toContain("you left this undecided in the interview");
    expect(killtest.toLowerCase()).not.toContain("could not point to a quote");
    expect(killtest).toContain(`### ${KILLTEST_FIELD_LABELS.rules} (2)`);
  });

  it("F3: the two screen sentences are built FROM the two projection stems", () => {
    // One source, two audiences. If the screen's wording is ever edited away
    // from the stem, the export and the screen stop describing the same
    // absence — which is the drift that produced this finding.
    expect(
      PLACEHOLDER_ABSENCE.startsWith(
        exportAbsenceSentence("voice", REASON_INFERRED)
      )
    ).toBe(true);
    expect(
      INTERVIEW_PLACEHOLDER_ABSENCE.startsWith(
        exportAbsenceSentence("strategy", REASON_INFERRED)
      )
    ).toBe(true);
    expect(exportAbsenceSentence("voice", REASON_INFERRED)).not.toBe(
      exportAbsenceSentence("strategy", REASON_INFERRED)
    );
    expect(exportAbsenceSentence("strategy", REASON_INFERRED)).toBe(
      exportAbsenceSentence("killtest", REASON_INFERRED)
    );
    // The one kind nothing writes borrows neither sentence.
    expect(exportAbsenceSentence("performance_meta", REASON_INFERRED)).not.toBe(
      exportAbsenceSentence("voice", REASON_INFERRED)
    );
    expect(exportAbsenceSentence("performance_meta", REASON_INFERRED)).not.toBe(
      exportAbsenceSentence("strategy", REASON_INFERRED)
    );
  });

  // ---- C1: the absence is selected by (kind, reason), never by kind alone ----

  it("F3/C1: a VOICE [check] the CREATOR typed is not blamed on a failed search of ours", async () => {
    const { workspaceScope, doc } = await seedVoice();
    await seedEditedVoice(workspaceScope, doc);
    const markdown = await markdownExport(workspaceScope);

    // PER VERSION, not per file: version 1 is inferred and legitimately says
    // we could not find a quote; version 2 is the creator's own edit and must
    // not. A whole-file assertion passes on a reason-blind renderer the moment
    // any inferred version is present — the exact shape that let round 1's
    // defect survive one population wider.
    const versionSection = (label: string): string => {
      const start = markdown.indexOf(label);
      expect(start, `no section ${label} in the export`).toBeGreaterThan(-1);
      const next = markdown.indexOf("\n## ", start + 1);
      return next === -1 ? markdown.slice(start) : markdown.slice(start, next);
    };
    const v2 = versionSection(`## ${BRAIN_KIND_LABELS.voice} — version 2`);
    const v1 = versionSection(`## ${BRAIN_KIND_LABELS.voice} — version 1`);

    // THE DEFECT, AS AN ASSERTION. Pinned to the words, so a selector that
    // silently falls back to the kind cannot satisfy it.
    expect(v2.toLowerCase()).toContain(
      "you left this unstated when you edited this version"
    );
    expect(v2.toLowerCase()).not.toContain("could not point to a quote");
    expect(v2).toContain(exportAbsenceSentence("voice", REASON_EDITED));
    // ...and the inferred version, in the SAME file, still says ours.
    expect(v1.toLowerCase()).toContain("could not point to a quote");
    // No screen-only control reaches the file, for either sentence.
    expect(markdown).not.toMatch(/Confirm it as still/);
  });

  it("F3/C1: an unclassifiable stored reason claims NOTHING about whose absence it is", async () => {
    const { workspaceScope, doc } = await seedVoice();
    // A hand-run UPDATE — `brain_docs.reason` is `text NOT NULL` and this is
    // what an incident can leave behind. The projection must not guess.
    await db
      .update(brainDocs)
      .set({ reason: "something nobody rendered" })
      .where(eq(brainDocs.id, doc.id));
    const markdown = await markdownExport(workspaceScope);
    expect(markdown).toContain("This position is recorded as not stated.");
    expect(markdown.toLowerCase()).not.toContain("could not point to a quote");
    expect(markdown.toLowerCase()).not.toContain("you left this undecided");
  });

  // ------------------------------------------ F4: whose words, and from when

  it("F4: a creator's own declaration is attributed differently from a saved post", async () => {
    const { workspaceScope, input } = await seedVoice();
    const { postedAt } = await seedStrategy(workspaceScope);
    const markdown = await markdownExport(workspaceScope);

    const day = postedAt.toISOString().slice(0, 10);
    const ownAnswer = quoteIntro("creator_authored", day);
    const savedPost = quoteIntro("own_post", day);
    expect(ownAnswer).not.toBe(savedPost);
    expect(input.content).toBe("I write directly");
    // The creator's typed declaration, named as theirs...
    expect(markdown).toContain(ownAnswer);
    expect(markdown).toContain("> The blunt one in a polite niche");
    // ...and the quote lifted from a post they saved, named as that.
    expect(markdown).toMatch(/From a post you saved on \d{4}-\d{2}-\d{2}:/);
    expect(markdown).toContain("> I write directly");
    // Non-vacuity: an unattributed bare blockquote is exactly the defect.
    const quoteLines = markdown
      .split("\n")
      .map((line, index, all) => (line.startsWith("> I ") || line.startsWith("> The ") ? all[index - 2] : null))
      .filter((line): line is string => line !== null);
    expect(quoteLines.length).toBeGreaterThan(0);
    for (const intro of quoteLines) {
      expect(intro, "a quote was printed with no provenance line above it").toMatch(
        /(Your own answer, from|From a post you saved on) \d{4}-\d{2}-\d{2}:/
      );
    }
  });

  // ------------------------- F5: human headings and values, not wire tokens

  it("F5: headings are field names and enum values are rendered, not raw tokens", async () => {
    const { workspaceScope } = await seedVoice();
    await seedStrategy(workspaceScope);
    const markdown = await markdownExport(workspaceScope);

    expect(markdown).toContain(`### ${STRATEGY_FIELD_LABELS.positioning}`);
    expect(markdown).toContain(`### ${STRATEGY_METRIC_FIELD_LABELS.direction}`);
    expect(markdown).toContain(`### ${VOICE_FIELD_LABELS.register}`);
    expect(markdown).toContain(`## ${BRAIN_KIND_LABELS.strategy} `);
    expect(markdown).toContain(BRAIN_STATUS_LABELS.proposed);
    // The direction's VALUE is a labelled dropdown choice, not a sentence the
    // creator typed. It renders as the label...
    expect(markdown).toContain(METRIC_DIRECTION_LABELS.higher_is_better);
    // ...while the stored quote stays verbatim, because the quote is evidence.
    expect(markdown).toContain("> higher_is_better");
    // No RFC-6901 heading anywhere.
    for (const line of markdown.split("\n")) {
      if (!line.startsWith("###")) continue;
      expect(line, "a raw pointer leaked into a markdown heading").not.toMatch(
        /^### \//
      );
    }
    expect(markdown).not.toContain("### /metric/direction");
    expect(markdown).not.toContain("### killtest");
  });

  it("F5: an unlabelled position is named as unnamed rather than printed as a pointer heading", () => {
    // The export may not refuse (R9), so the fallback is framing, not a throw.
    const heading = exportClaimHeading("voice", "/somethingNobodyNamed");
    expect(heading).not.toBe("/somethingNobodyNamed");
    expect(heading).toMatch(/do not have a name for/);
    expect(heading).toContain("/somethingNobodyNamed");
  });

  // -------------------------------------------------------------------- R13

  it("R13: every included table is this profile's rows only when a sibling shares the workspace", async () => {
    const { workspaceScope, doc } = await seedVoice();
    const [sibling] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "SIBLING-PROFILE" })
      .returning();
    const siblingScope = await ProfileScope.mint(db, workspaceScope, sibling.id);
    const siblingCaps = writeCapabilities(siblingScope);
    const siblingInput = await siblingCaps.appendOnboardingInput({
      inputClass: "own_post",
      content: "SIBLING-INPUT",
    });
    const siblingDoc = await db.transaction((tx) =>
      siblingCaps.writeBrainDoc(
        {
          kind: "voice",
          content: {
            register: "SIBLING-BRAIN",
            sentenceRhythm: "[check]",
            signatureMoves: [],
            avoid: [],
          },
          sourceEvidence: [
            {
              field: "/register",
              quote: siblingInput.content,
              inputId: siblingInput.id,
              startUtf16: 0,
              endUtf16: siblingInput.content.length,
            },
          ],
          reason: { code: "onboarding_inference" },
        },
        tx
      )
    );
    await db.insert(onboardingInterviewDrafts).values([
      { workspaceId, profileId, answers: { marker: "TARGET-DRAFT" } },
      { workspaceId, profileId: sibling.id, answers: { marker: "SIBLING-DRAFT" } },
    ]);
    const snapshots = await db
      .insert(brainActivationSnapshots)
      .values([
        { workspaceId, profileId, voiceDocId: doc.id },
        { workspaceId, profileId: sibling.id, voiceDocId: siblingDoc.id },
      ])
      .returning();
    // Slice 6 (stage A): a generation for the target AND one for the sibling,
    // so this test's non-vacuity check ("`generations` returned nothing — its
    // check is vacuous") has something to measure and its leak check has
    // something to leak. The claim row comes first because
    // `generations_attempt_fk` refuses a record with no attempt.
    for (const [index, owner] of [profileId, sibling.id].entries()) {
      const marker = owner === profileId ? "TARGET-SCRIPT" : "SIBLING-SCRIPT";
      await db.insert(generationAttempts).values({
        profileId: owner,
        workspaceId,
        attemptId: `att_export_${index}`,
        purpose: "generation",
        mode: "hookSet",
        payloadSha256: "a".repeat(64),
      });
      const [generation] = await db
        .insert(generations)
        .values({
          profileId: owner,
          workspaceId,
          attemptId: `att_export_${index}`,
          mode: "hookSet",
          brainActivationId: snapshots[index].id,
          request: { idea: marker },
          model: "claude-opus-5",
          promptBundleVersion: "pb-1",
          configVersion: 1,
          outcome: "usable",
          output: { hooks: [marker] },
          weakestPoint: "you have logged no results, so this is not evidence about you",
          killTest: { rulesFired: [], rewritten: false },
        })
        .returning();
      // Slice 7 (R10/R11): one feedback event for each, for exactly the reason
      // the generation above carries one — this test refuses a table that
      // returns nothing ("its check is vacuous"), and the leak check needs a
      // sibling row to leak. The NOTE carries the marker, so a leaked row is
      // identifiable in the emitted JSON rather than merely counted.
      await db.insert(generationFeedback).values({
        profileId: owner,
        workspaceId,
        generationId: generation.id,
        reaction: "used_as_is",
        note: `${marker}-FEEDBACK`,
      });
    }
    await db.insert(frameworks).values([
      {
        slug: "target-framework",
        name: "TARGET-FRAMEWORK",
        beats: [],
        whyItConverts: "target",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "unsupported",
        saturation: "observed",
        visibility: "private",
        ownerProfileId: profileId,
        workspaceId,
      },
      {
        slug: "sibling-framework",
        name: "SIBLING-FRAMEWORK",
        beats: [],
        whyItConverts: "sibling",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "unsupported",
        saturation: "observed",
        visibility: "private",
        ownerProfileId: sibling.id,
        workspaceId,
      },
    ]);

    const parsed = await jsonExport(workspaceScope);
    // EVERY included table, not the one the harness happened to name. All six
    // have a sibling row above, so a dropped predicate in any single branch of
    // `exportPage` is caught here rather than in five untested branches.
    expect(Object.keys(parsed.tables)).toEqual(INCLUDED_TABLES);
    for (const [table, rows] of Object.entries(parsed.tables)) {
      expect(rows.length, `${table} returned nothing — its check is vacuous`).toBe(1);
      expect(
        JSON.stringify(rows),
        `${table} leaked a same-workspace sibling profile`
      ).not.toContain("SIBLING-");
    }
    // Non-vacuity on the other side: the sibling's rows really are in the
    // tables this export just read from.
    const siblingParsed = await jsonExport(workspaceScope, sibling.id);
    expect(JSON.stringify(siblingParsed.tables)).toContain("SIBLING-BRAIN");
  });

  it("R13: a profile in another workspace is refused, not partially exported", async () => {
    const { workspaceScope } = await seedVoice();
    await seedAuthUser(db, "export_other");
    const otherWorkspaceId = (
      await ensureUserWorkspace(db, { authUserId: "export_other", name: "B" })
    ).workspace.id;
    const [otherProfile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: otherWorkspaceId, displayName: "Other" })
      .returning();
    await expect(
      openBrainExport(db, workspaceScope, otherProfile.id, "json")
    ).rejects.toBeInstanceOf(ProfileAccessError);
    await expect(
      openBrainExport(db, workspaceScope, otherProfile.id, "markdown")
    ).rejects.toBeInstanceOf(ProfileAccessError);
  });

  // -------------------------------------------------------------------- R15

  it("R15: shared library frameworks are excluded from the streamed export", async () => {
    const { workspaceScope } = await seedVoice();
    await db.insert(frameworks).values([
      {
        slug: "private-anna",
        name: "Anna's framework",
        beats: [],
        whyItConverts: "A private working note",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "unsupported",
        saturation: "observed",
        visibility: "private",
        ownerProfileId: profileId,
        workspaceId,
      },
      {
        // LIBRARY CONTENT, not this creator's. The old streaming case inserted
        // 30 rows all `visibility: 'private'`, so it could not have detected
        // the exclusion failing at all.
        slug: "shared-library",
        name: "SHARED-LIBRARY-ROW",
        beats: [],
        whyItConverts: "Library content",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "unsupported",
        saturation: "observed",
        visibility: "shared",
      },
    ]);

    const parsed = await jsonExport(workspaceScope);
    const rows = parsed.tables.frameworks as { slug: string; visibility: string }[];
    expect(rows.map((row) => row.slug)).toEqual(["private-anna"]);
    for (const row of rows) expect(row.visibility).toBe("private");
    expect(JSON.stringify(parsed.tables)).not.toContain("SHARED-LIBRARY-ROW");
    // Non-vacuity: the shared row exists and is visible to an unscoped read.
    expect(
      (await db.select().from(frameworks)).map((row) => row.slug).sort()
    ).toEqual(["private-anna", "shared-library"]);
  });

  it("R15: paging does not smuggle a shared row in past the first page", async () => {
    const { workspaceScope } = await seedVoice();
    await db.insert(frameworks).values(
      Array.from({ length: 30 }, (_, index) => ({
        slug: `stream-${index}`,
        name: `Stream ${index}`,
        beats: [],
        whyItConverts: "paged",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "unsupported" as const,
        saturation: "observed" as const,
        visibility: "private" as const,
        ownerProfileId: profileId,
        workspaceId,
      }))
    );
    await db.insert(frameworks).values({
      slug: "shared-across-pages",
      name: "SHARED-ACROSS-PAGES",
      beats: [],
      whyItConverts: "library",
      applicability: [],
      sourceReferences: [],
      evidenceEntries: [],
      testedCaveats: [],
      confidence: "unsupported",
      saturation: "observed",
      visibility: "shared",
    });

    const parsed = await jsonExport(workspaceScope);
    expect(parsed.tables.frameworks).toHaveLength(30);
    expect(JSON.stringify(parsed.tables)).not.toContain("SHARED-ACROSS-PAGES");
    const markdown = await markdownExport(workspaceScope);
    expect(markdown).toContain("human-readable projection");
    expect(markdown).not.toContain('"tables"');
  });

  // -------------------------------------------------------------------- R12

  it("R12: a real open pause does not withhold a creator's own data", async () => {
    const { workspaceScope } = await seedVoice();
    await seedStrategy(workspaceScope);
    await db.insert(pausePeriods).values({ workspaceId, startedAt: new Date() });

    // Drive BOTH formats to completion under the pause — the exemption is
    // about the whole stream, not about the call that opens it.
    const parsed = await jsonExport(workspaceScope);
    expect(Object.keys(parsed.tables)).toEqual(INCLUDED_TABLES);
    expect(parsed.tables.brain_docs).toHaveLength(2);
    const markdown = await markdownExport(workspaceScope);
    expect(markdown).toContain(`## ${BRAIN_KIND_LABELS.strategy} `);
    // Non-vacuity: the pause this export ignored is genuinely open.
    const [pause] = await db
      .select()
      .from(pausePeriods)
      .where(eq(pausePeriods.workspaceId, workspaceId));
    expect(pause.endedAt).toBeNull();
  });

  // ------------------------------------------------- the streaming envelope

  it("R14: markdown says in its own header that it is a projection, not the record", async () => {
    const { workspaceScope } = await seedVoice();
    const markdown = await markdownExport(workspaceScope);
    expect(markdown).toContain("human-readable projection");
    expect(markdown).toMatch(/JSON is the complete registry-driven machine-readable export/);
  });

  it("N1: the FILE says it cannot be read back in, not only the screen", async () => {
    const { workspaceScope } = await seedVoice();
    const markdown = await markdownExport(workspaceScope);
    // LITERAL, not `EXPORT_MARKDOWN_NOT_IMPORTABLE`'s value alone: a markdown
    // export that LOOKS re-importable is a data-loss bug waiting for its first
    // user, and `/brain`'s own sentence ("not a round-trip format") is on a
    // screen nobody is looking at six months later. Softening the constant
    // would move an identity assertion with it; these words cannot move.
    expect(markdown.toLowerCase()).toContain("cannot be read back in");
    expect(markdown.toLowerCase()).toContain("nothing in respin imports this file");
    // ...and it is in the HEADER, before any document section.
    const firstSection = markdown.indexOf("\n## ");
    expect(firstSection).toBeGreaterThan(-1);
    expect(markdown.slice(0, firstSection)).toContain(
      EXPORT_MARKDOWN_NOT_IMPORTABLE
    );
  });

  it("the markdown header states its OWN scope, not only the JSON's", async () => {
    // THE GAP THIS CLOSES (tenancy gate round 2, 2026-09-01). The header said
    // "JSON is the complete registry-driven machine-readable export" and
    // nothing about what THIS file leaves out. That was harmless while
    // `brain_docs` was the whole export; slice 6 added `generations`, which is
    // `holdsCreatorContent: true` and exported in JSON, so the file a creator
    // actually opens now returns their brain and no trace of what it produced.
    const { workspaceScope } = await seedVoice();
    const markdown = await markdownExport(workspaceScope);
    expect(markdown).toContain(EXPORT_MARKDOWN_SCOPE);
    // The WORDS, not only the constant: softening this to "some data is
    // elsewhere" would move an identity assertion with it. A creator has to be
    // able to tell that the missing thing is their generation history.
    expect(markdown.toLowerCase()).toContain("generation history");
    expect(markdown.toLowerCase()).toContain("json file only");
    // ...and it is in the HEADER, before any document section.
    const firstSection = markdown.indexOf("\n## ");
    expect(firstSection).toBeGreaterThan(-1);
    expect(markdown.slice(0, firstSection)).toContain(EXPORT_MARKDOWN_SCOPE);
  });

  it("...and the sentence is TRUE: the markdown streamer walks brain_docs and nothing else", () => {
    // THE HALF THAT GOES RED WHEN THE PROJECTION GROWS. The sentence above is
    // a claim about which tables this function reads, so it is pinned against
    // the function rather than trusted: the day someone teaches the markdown to
    // render generations, this fails and the scope sentence has to be revisited
    // in the same change. Derived from the streamer's own body, never restated.
    const source = readFileSync(resolve(SRC, "export.ts"), "utf8");
    const at = source.indexOf("async function streamMarkdownExport(");
    expect(at, "the streamer was renamed — this scan is now vacuous").toBeGreaterThan(-1);
    const body = source.slice(at, source.indexOf("\n}", at));
    const PAGED = /forEachExportPage\(\s*profileScope,\s*"([a-z_]+)"/g;
    const tables = [...body.matchAll(PAGED)].map((m) => m[1]);
    expect(tables.length, "the scan found no paged reads at all").toBeGreaterThan(0);
    expect([...new Set(tables)]).toEqual(["brain_docs"]);
    // NON-VACUITY (CLAUDE.md 2026-08-21): the same pattern finds a PLANTED
    // second table, so the assertion above is a measurement rather than a
    // regexp that stopped matching.
    const planted = [
      ...'await forEachExportPage(profileScope, "generations", tx, async () => {});'.matchAll(
        PAGED
      ),
    ].map((m) => m[1]);
    expect(planted).toEqual(["generations"]);
  });

  it("N3: every version in the file carries the SERVER-composed reason it exists for", async () => {
    const { workspaceScope, doc } = await seedVoice();
    await seedEditedVoice(workspaceScope, doc);
    const markdown = await markdownExport(workspaceScope);
    // The two live shapes of `renderBrainReason`, pinned as words. `/brain`
    // has printed this line under every version since slice 3; the artefact of
    // record did not, so the file omitted the one sentence saying whether a
    // version was inferred from the creator's posts or typed by them.
    expect(markdown).toContain("Version 2: you edited this document.");
    expect(markdown).toMatch(
      /Version 1: inferred from \d+ of your onboarding inputs?\./
    );
  });

  it("refuses a busy export before starting its producer transaction", async () => {
    const { workspaceScope } = await seedVoice();
    const transaction = vi.spyOn(db, "transaction");
    const slots: RunSlots = {
      async acquire(workspace, limit, namespace) {
        expect(workspace).toBe(workspaceScope.workspaceId);
        expect(limit).toBe(1);
        expect(namespace).toBe("export");
        return { granted: false, reason: "workspace_limit" };
      },
    };

    await expect(
      openBrainExport(db, workspaceScope, profileId, "json", slots)
    ).rejects.toBeInstanceOf(ExportBusyError);
    expect(
      transaction,
      "a refused session slot must not start the paged export transaction"
    ).not.toHaveBeenCalled();
  });

  it("preflights profile access before taking a session slot", async () => {
    const { workspaceScope } = await seedVoice();
    await seedAuthUser(db, "export_foreign");
    const foreignWorkspaceId = (
      await ensureUserWorkspace(db, { authUserId: "export_foreign", name: "Foreign" })
    ).workspace.id;
    const [foreign] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: foreignWorkspaceId, displayName: "Foreign" })
      .returning();
    let acquireCalls = 0;
    const slots: RunSlots = {
      async acquire() {
        acquireCalls += 1;
        return { granted: false, reason: "workspace_limit" };
      },
    };

    await expect(
      openBrainExport(db, workspaceScope, foreign.id, "json", slots)
    ).rejects.toBeInstanceOf(ProfileAccessError);
    expect(acquireCalls).toBe(0);
  });

  it("releases a pre-acquired export slot when cancelled before first pull", async () => {
    const { workspaceScope } = await seedVoice();
    const transaction = vi.spyOn(db, "transaction");
    let releases = 0;
    const slots: RunSlots = {
      async acquire() {
        return {
          granted: true,
          lease: {
            index: 0,
            async release() {
              releases += 1;
            },
          },
        };
      },
    };

    const iterable = await openBrainExport(
      db,
      workspaceScope,
      profileId,
      "json",
      slots
    );
    const iterator = iterable[Symbol.asyncIterator]();
    await iterator.return?.();
    expect(releases).toBe(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("a non-reading client hits the bounded lifetime, releases its slot, and cannot start later", async () => {
    const { workspaceScope } = await seedVoice();
    const transaction = vi.spyOn(db, "transaction");
    let releases = 0;
    const slots: RunSlots = {
      async acquire() {
        return {
          granted: true,
          lease: {
            index: 0,
            async release() {
              releases += 1;
            },
          },
        };
      },
    };
    const deadlineMs = 20;
    expect(deadlineMs).toBeLessThan(EXPORT_STREAM_DEADLINE_MS);
    const iterable = await openBrainExport(
      db,
      workspaceScope,
      profileId,
      "json",
      slots,
      new Date(),
      deadlineMs
    );
    expect(releases).toBe(0);
    await vi.waitFor(() => expect(releases).toBe(1), { timeout: 1_000 });
    expect(
      transaction,
      "the deadline must not lazily start an export the client never pulled"
    ).not.toHaveBeenCalled();
    await expect(iterable[Symbol.asyncIterator]().next()).rejects.toThrow(
      /exceeded its bounded lifetime/
    );
    expect(releases).toBe(1);
  });

  it("a started but stalled stream deadline settles its producer before releasing the slot", async () => {
    const { workspaceScope } = await seedVoice();
    const transaction = vi.spyOn(db, "transaction");
    let releaseStarted = false;
    let allowRelease!: () => void;
    const releaseGate = new Promise<void>((resolve) => {
      allowRelease = resolve;
    });
    const slots: RunSlots = {
      async acquire() {
        return {
          granted: true,
          lease: {
            index: 0,
            async release() {
              releaseStarted = true;
              await releaseGate;
            },
          },
        };
      },
    };
    const iterable = await openBrainExport(
      db,
      workspaceScope,
      profileId,
      "json",
      slots,
      new Date(),
      20
    );
    const iterator = iterable[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual(
      expect.objectContaining({ done: false })
    );
    expect(transaction).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(releaseStarted).toBe(true), { timeout: 1_000 });

    let nextSettled = false;
    const afterDeadline = iterator.next().finally(() => {
      nextSettled = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(
      nextSettled,
      "the deadline path returned before the shared advisory unlock completed"
    ).toBe(false);
    allowRelease();
    await expect(afterDeadline).rejects.toThrow(/exceeded its bounded lifetime/);
  });
});
