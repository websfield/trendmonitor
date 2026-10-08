// The public deletion sentences, DERIVED from the request flag (audit P5-R1's
// 2026-10-05 amendment; P1-A1 wrote the not-yet-open wording first).
//
// `/legal` and the changelog used to carry hand-written sentences that had to
// be rewritten "in the same change that enables a scope" — a promise kept by a
// person remembering. Now both read `RESPIN_DELETION_REQUEST_SCOPES` through
// the same closed parser the request facade refuses with
// (`respinDb.deletionRequestStatus`, `parseDeletionScopeList`), so the
// enabled wording renders exactly when a scope is enabled, and the
// not-yet-open wording otherwise. An unknown token in the flag throws, as it
// does for the request path: a misconfigured flag is refused, never guessed.
//
// `tests/marketing-claims.test.tsx` renders both pages with the flag unset and
// with `workspace` set, and pins both wordings.
import { respinDb } from "@respin/db";

type Scope = "identity" | "profile" | "workspace";

/** The scopes in the order a reader meets them, each in plain words. A list. */
const SCOPE_WORDS: readonly (readonly [Scope, string])[] = [
  ["identity", "accounts"],
  ["profile", "creator profiles"],
  ["workspace", "workspaces"],
];

/** The scopes this deployment lets a person request, read at render time. */
export function openDeletionScopes(): readonly Scope[] {
  const status = respinDb.deletionRequestStatus();
  return SCOPE_WORDS.map(([scope]) => scope).filter((scope) => status[scope]);
}

function words(open: readonly Scope[]): string {
  const named = SCOPE_WORDS.filter(([scope]) => open.includes(scope)).map(([, word]) => word);
  return named.length <= 1 ? named.join("") : `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`;
}

/** P1-A1's sentence, unchanged: the launch state. */
export const LEGAL_DELETION_NOT_OPEN =
  "Deletion requests are not open on this service yet. When they open, a deletion will have a recovery window, after which erasure is irreversible; financial records are kept pseudonymously for the period the law requires.";

/**
 * WHAT THE RECOVERY WINDOW GIVES, PER SCOPE (R-166, gate M3). One sentence
 * for every scope was false for two of them: during an ACCOUNT deletion the
 * person is tombstoned and the read grade refuses (R-163 is a
 * workspace-deletion grace only), so nothing can be exported; a tombstoned
 * PROFILE is refused by `assertProfileReadAccess`; and a WORKSPACE's export
 * is reached through `readScopeForUser`, which prefers an active workspace,
 * so only a person for whom the deleted workspace is their only one reaches
 * its export. The window is `DELETION_GRACE_MS` (seven days) for all three;
 * cancellation is the emailed recovery link plus the password for an account
 * and any active owner of the workspace for the other two (R-162). A list,
 * keyed by scope.
 */
const WINDOW_WORDS: Readonly<Record<Scope, string>> = {
  identity:
    "An account deletion has a seven-day recovery window, and the recovery link sent to the account's email address, with the account's password, cancels it; the account is closed during that window, so its data cannot be exported.",
  profile:
    "A creator profile deletion has a seven-day recovery window, during which any owner of its workspace can cancel it; the profile cannot be opened or exported during that window.",
  workspace:
    "A workspace deletion has a seven-day recovery window, during which any of its owners can cancel it, and a person for whom it is their only workspace can still export its brain.",
};

export function legalDeletionSentence(open: readonly Scope[]): string {
  if (open.length === 0) return LEGAL_DELETION_NOT_OPEN;
  const windows = SCOPE_WORDS.filter(([scope]) => open.includes(scope)).map(([scope]) => WINDOW_WORDS[scope]);
  return `Deletion requests are open on this service for ${words(open)}. ${windows.join(" ")} After that window, erasure is irreversible. Financial records are kept pseudonymously for the period the law requires.`;
}

/** P1-A1's changelog summary, unchanged: the launch state. */
export const CHANGELOG_DELETION_NOT_OPEN =
  "The deletion lifecycle is built: requests with a recovery window, an external append-only journal, and retention clocks for every table. It is not enabled on this service, and deletion requests are not open yet.";

export function changelogDeletionSummary(open: readonly Scope[]): string {
  if (open.length === 0) return CHANGELOG_DELETION_NOT_OPEN;
  return `The deletion lifecycle is built: requests with a recovery window, an external append-only journal, and retention clocks for every table. Deletion requests are open on this service for ${words(open)}.`;
}
