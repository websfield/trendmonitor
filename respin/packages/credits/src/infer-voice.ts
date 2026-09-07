// THE COMPOSED VOICE INFERENCE (slice 3). Infer → write; the creator confirms
// and activates afterwards, on their own screens.
//
// WHY THIS IS IN `packages/credits`. Two edges force it and neither is a
// preference. `@respin/llm` is DENIED from `app/**` and `lib/**` by
// `tests/import-boundary.test.ts`'s R6 case, so no server action may assemble a
// prompt; and this operation needs `runInference` (this package), the active
// config (`@respin/config`) and `writeBrainDoc` (`@respin/db`) in one place.
// `@respin/credits` is the only package that already depends on all three —
// the same layering argument that put `createProfile` and `runInference` here.
//
// WHAT THIS FILE DOES **NOT** DO, deliberately:
//
//   - It does not confirm and it does not activate. Those are the creator's
//     acts (REQ-B02), they happen on a later screen, and a function that
//     inferred and activated in one call would be the silent brain update R-8
//     forbids. The document it writes is `proposed`, which is server-derived.
//   - It does not re-implement a single gate from `runInference`. The pause,
//     role, archived-profile, balance, price and slot gates all run inside that
//     call, in the order slice 2a's four reviewer gates established. This file
//     adds exactly one pre-call refusal — too few posts — and it is here rather
//     than there because it is a property of the OPERATION, not of the money.
import {
  enumerateClaimFields,
  mintProfileScope,
  writeCapabilities,
  type DbLike,
  type OnboardingInput,
  type RunSlots,
  type SourceEvidenceEntry,
  type WorkspaceScope,
} from "@respin/db";
import {
  assembleVoicePrompt,
  parseVoiceReply,
  CHECK,
  type AssembledField,
  type AssembledValue,
  type ClaimSpec,
  type LlmProvider,
  type OwnPost,
} from "@respin/llm";
import {
  InferenceRoleError,
  runInference,
  type RunInferenceResult,
} from "./inference";
import { BrainPointerDivergenceError } from "./errors";

/**
 * The `voice` document's fields, and the only place their guidance lives.
 *
 * NOT read from the zod schema, because a zod schema carries no guidance text
 * and inventing one from a key name ("register" → "the register") would send
 * the model a word rather than an instruction. Kept beside the operation that
 * uses it, and pinned to the schema by a test: `voice-fields.test.ts` asserts
 * this list matches `BRAIN_CONTENT_SCHEMAS.voice`'s claim-bearing keys exactly,
 * so widening the schema without widening this list is a red test rather than a
 * field the creator is never asked about — which would be an unconfirmable
 * position and therefore a document that can never activate.
 */
export const VOICE_FIELDS: ClaimSpec[] = [
  {
    key: "register",
    kind: "single",
    guidance:
      "how formal or informal they are, and who they sound like they are talking to",
  },
  {
    key: "sentenceRhythm",
    kind: "single",
    guidance:
      "how their sentences are paced — length, variation, where they break",
  },
  {
    key: "signatureMoves",
    kind: "list",
    max: 5,
    guidance:
      "recurring things they do that another writer would not, each stated as an action",
  },
  {
    key: "avoid",
    kind: "list",
    max: 5,
    guidance: "things they visibly never do, each stated as an action",
  },
];

/**
 * How many of a creator's own posts one inference reads.
 *
 * A PRODUCT LIMIT BESIDE ITS USE, not an operator dial — the same argument
 * `POST_CONTENT_MAX` and `POST_COUNT_MAX` carry: moving it is a code change
 * with a test, not a knob. It exists because the priced call is unbounded in
 * its INPUT otherwise: `POST_COUNT_MAX` is 2,000 and `POST_CONTENT_MAX` is
 * 20,000 characters, so an unbounded corpus is up to 40 MB of prompt on a call
 * whose first instance is free (billing gate, 2026-08-29).
 *
 * IT IS NOW THE CEILING, NOT THE VALUE (billing gate round 2, 2026-08-29).
 * The operational number is `onboarding.voiceCorpusMaxPosts` in the stored
 * config, because it bounds what we SEND AND PAY FOR and the creator can do
 * nothing about it — the `maxOutputTokens` shape, not the `POST_CONTENT_MAX`
 * one. This constant is the hard ceiling the schema and the accessor both cap
 * against, so a config value above it is refused rather than silently clamped.
 */
export const VOICE_CORPUS_MAX_POSTS = 50;

/**
 * The bundle this operation's prompt comes from, recorded on every spend row.
 *
 * Bumped whenever `assembleVoicePrompt`'s wording or the `VOICE_FIELDS`
 * guidance changes in a way that would move what the model returns — that is
 * the whole point of attributing spend to a bundle.
 */
export const VOICE_PROMPT_BUNDLE_VERSION = "slice3-voice-v1";

export type InferVoiceResult = {
  brainDocId: string;
  /** The run's metering facts, passed through so the screen can be honest. */
  run: RunInferenceResult;
  /** How many claim positions the creator now has to confirm. */
  claimPositions: number;
  /** How many of those hold `[check]` rather than a stated value. */
  placeholders: number;
  /** How many of the creator's own posts this inference actually read. */
  postsUsed: number;
  /**
   * How many they have in total.
   *
   * BOTH numbers, so the screen can say "the most recent 50 of your 200" rather
   * than implying the whole corpus was used. The compliance gate found the
   * screen claiming exactly that while the read was silently clamped.
   */
  postsAvailable: number;
};

/**
 * Infer a `voice` document from the creator's own posts and store it as
 * `proposed`.
 *
 * @throws NotEnoughPostsError before any vendor call (R6).
 * @throws AssemblyError when the reply cannot be trusted (R2/R3) — no document
 * is written on any of those paths.
 */
export async function inferVoice(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string,
  provider: LlmProvider,
  slots: RunSlots,
  attemptId: string,
  minPosts: number,
  corpusMaxPosts: number,
  at: Date,
): Promise<InferVoiceResult> {
  // The cage first, exactly as `runInference` does it, and for the same reason:
  // `app/**` never holds a profile-grained scope, so there is nothing there to
  // forge. Minted here as well as inside `runInference` because this function
  // reads the creator's posts BEFORE the call, and that read must be caged too.
  const scope = await mintProfileScope(db, workspaceScope, profileId);
  // Building the durable onboarding brain is owner-only. Keep this outer gate
  // before corpus reads and before `runInference` can reserve a slot, contact a
  // provider, or debit credits; the transaction-local capability check remains
  // the final write authority.
  if (scope.role !== "owner") throw new InferenceRoleError(scope.role);

  // R4 — ONLY THE CREATOR'S OWN POSTS REACH A MODEL.
  //
  // THE FILTER IS IN THE QUERY NOW, not in JavaScript over a page (compliance
  // gate, 2026-08-29). The old shape read `onboardingInputs()` — the 50 NEWEST
  // rows of ANY class — and filtered afterwards, which filtered the wrong set
  // twice over: a creator with 200 posts paid for a voice inferred from a
  // quarter of them while the screen said "the posts you saved above", and once
  // slice 4 lands `reference` inputs, 50 recent references would starve
  // `own_post` out of the window and refuse a creator with hundreds of their
  // own. `ownPostsNewest` filters on `input_class` in SQL and takes the limit
  // explicitly.
  //
  // AND THE COMMENT HERE USED TO CLAIM A SECOND CHECK THAT DOES NOT EXIST. It
  // said "the assertion is in `assembleVoicePrompt`". There is none, and there
  // could not be: `OwnPost` carries `id` and `content` only, so the assembler
  // has nothing to assert on. G-12's product half rests on THIS query and on
  // `packages/credits/tests/infer-voice.test.ts`, which plants a `reference`
  // row and proves neither its id nor its text reaches the provider.
  //
  // What the query can promise is "nothing labelled `reference` was sent" —
  // never "everything sent was really theirs". R8's attestation is what backs
  // the label, and that warrant's limit is recorded in R-47.
  const rows = await scope.accessors.ownPostsNewest(corpusMaxPosts);
  const posts: OwnPost[] = rows.map((i: OnboardingInput) => ({
    id: i.id,
    content: i.content,
  }));
  // What the creator has, so the screen can state the bound rather than imply
  // the whole corpus was used. TWO READS, NOT ONE SNAPSHOT (compliance round-3
  // NOTE): this count runs after the page read above and outside any shared
  // transaction, so a post pasted between the two can make `postsAvailable`
  // lag or lead `postsUsed`'s corpus by one. The screen renders both as "as of
  // this run", and the bound sentence stays silent unless available EXCEEDS
  // used — a race can delay the sentence by one run, never make it overclaim.
  const ownPostsAvailable = await scope.accessors.countOwnPosts();

  // Throws NotEnoughPostsError below the minimum — BEFORE the vendor is
  // contacted, which is the requirement. Spending a creator's included run to
  // produce `[check]` in every field is honest and useless.
  const { system, prompt } = assembleVoicePrompt({
    posts,
    fields: VOICE_FIELDS,
    minPosts,
  });

  // Every gate slice 2a built runs inside this call, in its established order.
  const run = await runInference(
    db,
    workspaceScope,
    profileId,
    provider,
    slots,
    {
      attemptId,
      system,
      prompt,
      // ITS OWN BUNDLE. The default is slice 2a's connectivity ping, which
      // this operation does not run (billing gate, 2026-08-29).
      promptBundleVersion: VOICE_PROMPT_BUNDLE_VERSION,
    },
    at,
  );

  // FAIL CLOSED, AFTER THE MONEY. A reply we cannot trust throws here, and the
  // throw is deliberately AFTER `runInference` has committed `model_usage` and
  // taken its debit: the tokens were really spent, so the spend record must
  // survive the refusal. That is the same A-7 settlement-tail direction the
  // two-transaction split in R-41 takes, applied one layer up.
  const fields = parseVoiceReply({ text: run.text, fields: VOICE_FIELDS, posts });

  const { content, sourceEvidence } = buildVoiceDocument(fields);

  // THE POINTERS ARE DERIVED FROM THE STORED CONTENT, NOT ASSUMED.
  //
  // `buildVoiceDocument` builds `/signatureMoves/0`-style pointers by the
  // RFC-6901 convention, and `enumerateClaimFields` derives the same pointers
  // by walking schema and instance together. If those two ever disagree, the
  // evidence would point at positions the activation gate does not know about
  // and the creator would be asked to confirm a set that can never satisfy it.
  // Checked rather than trusted, because the disagreement is silent: the
  // document writes, the screen renders, and activation refuses forever.
  const enumerated = enumerateClaimFields("voice", content);
  const cited = new Set(sourceEvidence.map((e) => e.field));
  const unknown = [...cited].filter((p) => !enumerated.includes(p));
  if (unknown.length > 0) {
    throw new BrainPointerDivergenceError(unknown);
  }

  const caps = writeCapabilities(scope);
  const doc = await db.transaction(async (tx) =>
    caps.writeBrainDoc(
      {
        kind: "voice",
        content,
        sourceEvidence,
        // A CODE, NOT A SENTENCE (C-42): `brain_docs.reason` is exported whole
        // and REQ-I03 binds any output, so the stored text is rendered by the
        // server from this code.
        // A CODE AND NOTHING ELSE. `BrainDocReason` has no free-text member and
        // no `detail` escape hatch, deliberately — the stored sentence is
        // rendered by the server from this code plus facts it counted itself
        // (`renderBrainReason`), so the post count below is NOT passed in.
        reason: { code: "onboarding_inference" },
      },
      tx,
    ),
  );

  return {
    brainDocId: doc.id,
    run,
    claimPositions: enumerated.length,
    placeholders: enumerated.filter((p) => !cited.has(p)).length,
    postsUsed: posts.length,
    postsAvailable: ownPostsAvailable,
  };
}

/**
 * Turn parsed fields into the stored document and its evidence.
 *
 * Exported for its own tests: this is where the pointer convention lives, and a
 * convention that only runs behind a vendor call is a convention nothing can
 * check cheaply.
 */
export function buildVoiceDocument(fields: AssembledField[]): {
  content: Record<string, unknown>;
  sourceEvidence: SourceEvidenceEntry[];
} {
  const content: Record<string, unknown> = {};
  const sourceEvidence: SourceEvidenceEntry[] = [];

  for (const f of fields) {
    if (f.kind === "single") {
      const v = f.values[0];
      content[f.key] = v.value;
      if (v.evidence) {
        sourceEvidence.push({ field: `/${f.key}`, ...v.evidence });
      }
      continue;
    }
    // A LIST WHOSE ONLY VALUE IS THE PLACEHOLDER IS A ONE-ENTRY LIST, not an
    // empty one. An empty array enumerates to ZERO claim positions, so the
    // creator would never be asked about the field at all and activation would
    // pass over it vacuously — the same fail-open shape `enumerateClaimFieldsOf`
    // refuses for absent objects. One `[check]` entry is a position the creator
    // sees and confirms as still unknown, which is what REQ-B02 asks for.
    content[f.key] = f.values.map((v: AssembledValue) => v.value);
    f.values.forEach((v: AssembledValue, i: number) => {
      if (v.evidence) {
        sourceEvidence.push({ field: `/${f.key}/${i}`, ...v.evidence });
      }
    });
  }

  // The non-empty CHECK on `source_evidence` refuses a document in which
  // nothing is grounded, and `writeBrainDoc` refuses it by name. Reaching that
  // refusal means the model returned `[check]` for every field, which is a real
  // outcome for a creator whose posts are all links — so it is worth the caller
  // knowing it is possible. Not thrown here: `writeBrainDoc`'s message is the
  // one that names the rule.
  return { content, sourceEvidence };
}

/** True when every claim position in a parsed reply is a placeholder. */
export function isAllPlaceholders(fields: AssembledField[]): boolean {
  return fields.every((f) =>
    f.values.every((v: AssembledValue) => v.value === CHECK),
  );
}
