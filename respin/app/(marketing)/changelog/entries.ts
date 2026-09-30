// The changelog's entries. Newest first. Each entry states what exists in the
// product; `tests/changelog.test.ts` scans every line against the forbidden
// claims canon, so an entry cannot promise learning, accuracy or results.
export type ChangelogEntry = Readonly<{ date: string; title: string; summary: string }>;

export const CHANGELOG: readonly ChangelogEntry[] = [
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
    summary:
      "Deletion requests with a recovery window, an external append-only journal, and retention clocks for every table. Erasure is enabled per deployment.",
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
