// Disclosures that say a capability DOES NOT EXIST YET, and the symbols whose
// existence makes them false.
//
// THE FAILURE THIS EXISTS FOR (slice 2a, found by walking the product, not by a
// test). Two screens carried honest "not built yet" sentences written in M1:
//
//   /usage        "Nothing has been spent yet: generation arrives in a later
//                  milestone (M3), and only a generation spends credits."
//   /settings/billing
//                 "Nothing can trigger this yet: generation arrives in a later
//                  milestone (M3), and only a generation spends credits."
//
// Slice 2a made both false in one commit. The metered run on `/onboarding`
// spends credits, and `runInference` gave auto-top-up its first caller. A
// creator who had just watched a run refused for want of credits could read a
// sentence telling them nothing can spend any — on the two surfaces whose whole
// subject is money.
//
// NEITHER COVERING TEST NOTICED, and that is the general shape worth guarding.
// They assert the section renders and invents no number; both stayed true while
// the sentence stopped being. A disclosure about ABSENCE is the one kind of
// copy that rots silently when the codebase grows — every other kind is wrong
// only if someone edits it.
//
// So each row below pairs the forbidden sentence with the CODE FACT that
// falsified it. The code fact is asserted too: if the capability is ever
// removed, this test fails rather than quietly forbidding copy that has become
// true again.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCAN_ROOTS, blankComments, walkCodeFiles } from "./support/app-surface";

const respinRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Every file a creator's rendered copy can come from. */
function appSources(): { path: string; code: string }[] {
  return SCAN_ROOTS.flatMap((r) => [
    ...walkCodeFiles(resolve(respinRoot, r)),
  ]).map((f) => ({
    path: f.replace(respinRoot, "").replace(/\\/g, "/"),
    // Comments are blanked: this file's OWN explanation quotes the retired
    // sentences, and so do the two components' new comments. A scan that
    // cannot tell copy from an explanation of why the copy changed would be
    // unfixable.
    code: blankComments(readFileSync(f, "utf8")),
  }));
}

describe("a disclosure of absence does not outlive the absence", () => {
  it("no screen claims that ONLY A GENERATION spends credits — the metered run does", () => {
    const offenders = appSources()
      .filter(({ code }) => /only a generation spends credits/i.test(code))
      .map(({ path }) => path);
    expect(
      offenders,
      "this became false when the metered run shipped: `/onboarding` spends credits today"
    ).toEqual([]);
  });

  it("...and the code fact that makes it false is still true", () => {
    // NOT A RESTATEMENT OF THE RULE — the reason for it. `runInference` debits
    // credits, so a claim that only generation can is wrong. If this ever
    // stops being true, the sentence above becomes sayable again and this test
    // is what tells you.
    const inference = readFileSync(
      resolve(respinRoot, "packages/credits/src/inference.ts"),
      "utf8"
    );
    expect(
      inference,
      "runInference no longer debits — the copy rule above may need revisiting"
    ).toMatch(/await debitCredits\(/);
  });

  it("no screen claims a creator's posts STAY on this server — the voice draft sends them", () => {
    // SLICE 3's INSTANCE, and the worst-placed one yet (compliance gate BLOCK,
    // 2026-08-29). The paste panel said "nothing else reads them yet — this
    // screen keeps them, and that is all it does", two panels above the control
    // that posts those same words to a model vendor. Every other row in this
    // file is a disclosure about money going stale; this one is a false
    // data-handling statement made at the moment of collection, which is the
    // moment it matters most.
    const offenders = appSources()
      .filter(({ code }) =>
        /nothing else reads them|this screen keeps them/i.test(code)
      )
      .map(({ path }) => path);
    expect(
      offenders,
      "slice 3 sends the creator's own posts to the model provider; a screen may not tell them otherwise while collecting them"
    ).toEqual([]);
  });

  it("...and the code fact that makes THAT false is still true", () => {
    // The reason, not a restatement: `inferVoice` reads the creator's own posts
    // and hands them to `assembleVoicePrompt`, whose output goes to the vendor.
    // If that ever stops being true the sentence becomes sayable again, and
    // this is what says so.
    const inferVoice = readFileSync(
      resolve(respinRoot, "packages/credits/src/infer-voice.ts"),
      "utf8"
    );
    expect(
      inferVoice,
      "inferVoice no longer reads the creator's own posts — the copy rule above may need revisiting"
    ).toMatch(/ownPostsNewest\(/);
    expect(inferVoice).toMatch(/assembleVoicePrompt\(/);
  });

  it("no screen claims NOTHING CAN TRIGGER auto-top-up — runInference does", () => {
    const offenders = appSources()
      .filter(({ code }) => /nothing can trigger this yet/i.test(code))
      .map(({ path }) => path);
    expect(
      offenders,
      "auto-top-up gained its first caller in slice 2a; a dead-control disclosure on a money setting must not outlive the control being dead"
    ).toEqual([]);
  });

  it("...and the code fact that makes THAT false is still true", () => {
    const inference = readFileSync(
      resolve(respinRoot, "packages/credits/src/inference.ts"),
      "utf8"
    );
    expect(
      inference,
      "runInference no longer calls maybeAutoTopup — the dead-control disclosure may be honest again"
    ).toMatch(/maybeAutoTopup\(/);
  });

  it("NON-VACUITY: the scan reads real copy and would catch a planted sentence", () => {
    const sources = appSources();
    expect(sources.length, "the walk found no app sources").toBeGreaterThan(10);
    // It really is looking at rendered copy, not just file names.
    expect(
      sources.some(({ code }) => /Credit balance/.test(code)),
      "the usage screen's copy was not in the scanned set"
    ).toBe(true);
    // ...and the predicates fire on the exact retired sentences.
    expect(
      /only a generation spends credits/i.test(
        "Nothing has been spent yet: generation arrives in a later milestone (M3), and only a generation spends credits."
      )
    ).toBe(true);
    expect(
      /nothing can trigger this yet/i.test(
        "Nothing can trigger this yet: generation arrives in a later milestone (M3)."
      )
    ).toBe(true);
  });
});
