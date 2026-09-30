// THE ONE PREDICATE THAT DECIDES WHETHER A STRING MAKES A FORBIDDEN CLAIM.
//
// WHY IT EXISTS (audit 2026-09-19 finding 27, applied 2026-09-20). Three
// screens' honesty scans had each re-invented the predicate, and all three
// re-invented it WRONG, in the same words:
//
//   const pattern = typeof claim === "string" ? claim
//     : (claim as { pattern?: RegExp | string }).pattern ?? String(claim);
//   const hit = pattern instanceof RegExp ? pattern.test(lower)
//     : lower.includes(String(pattern).toLowerCase());
//
// `FORBIDDEN_CLAIMS` entries are `readonly [label, RegExp]` TUPLES. An array
// has no `.pattern`, so `?? String(claim)` yields the stringified tuple
// `"learn,/\blearn/"`, `instanceof RegExp` is false, and the surviving branch
// asks whether the page contains that literal text. It never does. All nine
// canon words were unenforced on the public Sample Spin panel, on `/legal`, on
// every changelog entry and on the admin activation report — with the suite
// green, because a scan that finds nothing and a scan that looks for nothing
// are indistinguishable from the outside (CLAUDE.md, 2026-08-26).
//
// Sixteen other consumers destructured `[label, pattern]` and fired correctly.
// The fix is therefore NOT "correct the three": it is to remove the thing that
// was re-invented. The register said so in its own words — "put the predicate
// in one shared `tests/support` helper so a fourth screen cannot re-invent it"
// — and a fifth inlined copy was written anyway, in the marketing scan added
// to close this very class. That copy is retired here too.
//
// THE TYPE IS THE OTHER HALF. `claimHits` takes `ForbiddenClaim` lists and
// destructures them. There is no `as` cast and no `typeof === "string"`
// branch, so the shape that produced the defect cannot be expressed: passing
// anything but a tuple list is a compile error, not a silent pass.
import { CLAIM_SPECIMENS, type ForbiddenClaim } from "./forbidden-claims";

/**
 * The labels of every claim `text` makes.
 *
 * `text` is lowercased once here rather than by each caller, because every
 * pattern in every list is written lowercase with no `i` flag and a caller
 * that forgot would get a silently weaker scan.
 */
export function claimHits(
  text: string,
  ...lists: readonly (readonly ForbiddenClaim[])[]
): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const list of lists) {
    for (const [label, pattern] of list) {
      // `lastIndex` IS RESET BEFORE EVERY TEST, and this line is not defensive
      // padding — it closes a fail-open the first version of this file shipped
      // one line below the hole it was written to close (batch-4 gate).
      //
      // The canon's `RegExp` objects are module-level and shared by every
      // caller. A `g` flag makes `.test()` advance `lastIndex`, so the SAME
      // input alternates true/false across successive calls — measured:
      // `[stateful] -> [] -> [stateful]`. `marketing-claims.test.tsx` calls
      // this 8+ times per run over the same lists, so one `g` added by a
      // future author would silently unscan half the marketing routes with the
      // suite green.
      //
      // THIS LINE FIXES `g`. IT DOES NOT FIX `y`, and the sentence that used
      // to stand here said it fixed both (batch-5 compliance gate, C-7). A
      // sticky pattern with `lastIndex = 0` is ANCHORED at position 0: it
      // stops alternating and starts under-matching, which is the same
      // fail-open with a steadier hand. Measured in `claim-scan.test.ts`
      // beside the `g` case, so the limit is a running assertion rather than
      // this comment.
      //
      // What covers `y` is the OTHER half of that case: every entry of every
      // list is asserted flagless against the tree. No entry carries a flag
      // today — and that is a fact about the tree, not a property of this
      // code, which is exactly why it is asserted. Typing the tuple closed one
      // silent-pass hole; this line closes the `g` half of the other.
      pattern.lastIndex = 0;
      if (pattern.test(lower)) hits.push(label);
    }
  }
  return hits;
}

/**
 * Every claim in the given lists, as `[label, specimen]` pairs.
 *
 * A consumer drives this through `claimHits` to prove its own scan is LIVE —
 * that the predicate it is about to trust catches a planted violation of every
 * entry, on this screen, today. The three vacuous scans were also the only
 * three canon consumers with no specimen loop; nothing outside them ever tried
 * to break them, which is exactly the 2026-08-26 lesson. So the helper hands
 * every caller the means to try.
 */
export function specimensFor(
  ...lists: readonly (readonly ForbiddenClaim[])[]
): [label: string, specimen: string][] {
  return lists.flatMap((list) =>
    list.map(([label]): [string, string] => {
      const specimen = CLAIM_SPECIMENS[label];
      if (specimen === undefined) {
        throw new Error(`${label} has no specimen in CLAIM_SPECIMENS`);
      }
      return [label, specimen];
    })
  );
}
