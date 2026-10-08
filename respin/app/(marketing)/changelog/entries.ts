// The changelog's entries. Newest first. Each entry states what exists in the
// product; `tests/changelog.test.ts` scans every line against the forbidden
// claims canon, so an entry cannot promise learning, accuracy or results.
import { changelogDeletionSummary } from "../deletion-status";

export type ChangelogEntry = Readonly<{ date: string; title: string; summary: string }>;

type DeletionScopes = Parameters<typeof changelogDeletionSummary>[0];

/**
 * The entries, with the 2026-09-08 deletion entry DERIVED from the request
 * flag (P5-R1's amendment): the page passes the deployment's open scopes, so
 * the entry cannot say "not open" on a deployment that opened a scope, or the
 * reverse. `CHANGELOG` below is the launch state (no scope open), which is
 * what `tests/changelog.test.ts` scans; `tests/marketing-claims.test.tsx`
 * renders the enabled form too.
 */
export function changelogFor(openScopes: DeletionScopes): readonly ChangelogEntry[] {
  return entries(changelogDeletionSummary(openScopes));
}

const entries = (deletionSummary: string): readonly ChangelogEntry[] => [
  {
    date: "2026-09-09",
    title: "Sample Spin on the landing page",
    summary:
      "A visitor can run one idea through a fictional sample brain and a synthetic reference reel using the same Analyse-and-spin pipeline signed-in creators use, gates included. Off by default; opened per deployment.",
  },
  {
    date: "2026-09-09",
    title: "Result comparisons use connector-verified numbers only",
    summary:
      "Self-reported result numbers stay visible with their label but no longer enter comparisons or rule proposals. Until an analytics connector exists, comparisons say so instead of computing.",
  },
  {
    date: "2026-09-08",
    title: "Account, profile and workspace deletion",
    // P1-A1 wrote the not-yet-open sentence; P5-R1's amendment derives it
    // from RESPIN_DELETION_REQUEST_SCOPES (`../deletion-status`), so it is
    // rewritten by the flag, never by a person remembering to.
    summary: deletionSummary,
  },
  {
    date: "2026-09-05",
    title: "Proposals from your feedback",
    summary:
      "The Creator Brain proposes voice rules and Kill Test rules from repeated structured feedback; nothing changes without an explicit accept. Proposals from logged results wait on a platform analytics connection this product does not hold.",
  },
  {
    date: "2026-09-03",
    title: "Trends and Spin",
    summary:
      "Paste a link and transcript, get a four-stage autopsy, and spin its mechanism through your brain behind a hard similarity gate.",
  },
  {
    date: "2026-08-31",
    title: "Studio modes and the Creator Brain",
    summary:
      "Six Studio modes — the seventh, Spin, lives on Trends — plus the Kill Test, traceability and the [check] marker for specifics the product will not invent; a versioned, confirmable Creator Brain with export.",
  },
];

/** The launch state: no deletion request scope open. */
export const CHANGELOG: readonly ChangelogEntry[] = changelogFor([]);
