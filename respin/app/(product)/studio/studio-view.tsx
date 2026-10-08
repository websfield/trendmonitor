// PURE presentation for `/studio` (slice 6, stage D; widened by slice 7). The
// page component does the gate, the scoping and the reads; this file only
// renders what it is handed — so every state below (no profile, no activated
// brain, viewer, paused, a draft, an honest refusal, a refusal code) is
// reachable from a test with a fixture instead of a database. That is the same
// contract `usage-view.tsx` and `onboarding-view.tsx` hold, and it is what lets
// the honesty scan run over this screen's REAL copy rather than a sample of it.
//
// WHAT THIS SCREEN MAY NOT SAY (non-negotiable 6, and R20/R21 in particular).
// It hands a creator something they might publish, and the product has logged
// no result of theirs at all — the results loop is slice 9 — so nothing here
// may suggest a draft is shaped by what has worked for them, and nothing may
// state how it is going to do. `tests/studio-ui.test.tsx` scans every rendered
// state of this file against the shared canon in
// `tests/support/forbidden-claims.ts` plus that file's PERFORMANCE_CLAIMS.
//
// SLICE 7 ADDS THE HARDEST CASE OF THAT RULE: this screen now RECORDS FEEDBACK,
// and a reaction button is exactly where a reader forms the belief that the
// product is adjusting to them. `learn`, `improv` and `train` are banned on
// every creator-facing surface and this is the screen where the ban earns its
// keep — `FEEDBACK_TODAY` in `./run-copy.ts` is the sentence that says what
// feedback does and does not do without reaching for any of the three.
//
// AND WHAT IT MAY: `/studio` LEFT the `NOT_BUILT_YET` ban list in slice 6
// (R21), because it genuinely generates now — see `STUDIO_POSITIVE_ASSERTIONS`
// in that same file for the markers that replaced the three bans, and why a
// word leaving a ban has to be paid for rather than simply removed.
import { Banner } from "../../ui/banner";
import { StudioEntrances, type StudioEntrancesProps } from "./entrances";
import { PieceConfirmation, type PieceConfirmationProps } from "./piece-confirmation";
import { StudioPanel, type StudioPanelProps } from "./studio-panel";
import { FocusedStatus } from "./focus";
import { formatSavedAt } from "./saved/saved-copy";
import {
  OTHER_MODES_HEADING,
  PIECE_CANCELLED_STATUS,
  RECENT_PACKS_EMPTY,
  RECENT_PACKS_HEADING,
  RECENT_PACKS_NOTE,
  RECENT_PACKS_UNAVAILABLE,
  VOICE_DOCUMENT_NEEDED,
  savedPackHref,
} from "./run-copy";

export type StudioViewProps = {
  /** The creator this draft would be for, or null when none is selected. */
  profileName: string | null;
  /**
   * Launch L2: the confirmation of a chosen piece (`/studio?piece=<id>`), or
   * null when no piece is open. Rendered ABOVE everything else.
   */
  piece?: PieceConfirmationProps | null;
  /** The refusal copy when the named piece could not be read. */
  pieceError?: { title: string; detail: string } | null;
  /** A piece was just cancelled (`?cancelled=1`): say so, and take focus there. */
  pieceCancelled?: boolean;
  /** Launch L2: the entrances, or null when there is no profile. */
  entrances?: StudioEntrancesProps | null;
  /** The generate control, or null when there is no profile to run it for. */
  run: StudioPanelProps | null;
  /** Copy for a `?e=` code a refused action redirected back with. */
  error: { title: string; detail: string } | null;
  onboardingHref: string;
  brainHref: string;
  usageHref: string;
  /** Where the creator curates their own frameworks (R5c). */
  frameworksHref: string;
  /** An active brain without its voice document needs an explicit remedy. */
  brainActiveWithoutVoice: boolean;
  /**
   * Launch L4 (R-153): this profile's recent saved drafts, each a link to its
   * recording pack; `null` when the read failed, `undefined` when there is no
   * profile (nothing is rendered).
   */
  recentPacks?: readonly RecentPackLine[] | null;
};

/** One saved draft in the recent list — plain values only. */
export type RecentPackLine = {
  attemptId: string;
  modeLabel: string;
  createdAt: string;
  outcome: "usable" | "honest_refusal";
  title: string | null;
};

/** The recent saved drafts, newest first: the way back after a closed tab. */
/**
 * A recent draft's link text (accessibility C4). A draft with a first line is
 * named by it; one without (an honest refusal, an unreadable output) is named
 * by its kind, its outcome and when it was saved — never by the mode label
 * alone, which made every refusal of one mode the same link.
 */
export function recentPackLinkText(p: RecentPackLine): string {
  if (p.title !== null) return p.title;
  const what = p.outcome === "honest_refusal" ? "honest refusal" : "draft";
  return `${p.modeLabel} ${what}, saved ${formatSavedAt(p.createdAt)}`;
}

function RecentPacks({ packs }: { packs: readonly RecentPackLine[] | null }) {
  return (
    <section className="panel" aria-labelledby="studio-recent-packs-heading" data-testid="studio-recent-packs">
      <h2 id="studio-recent-packs-heading" style={{ marginTop: 0 }}>{RECENT_PACKS_HEADING}</h2>
      <p className="muted">{RECENT_PACKS_NOTE}</p>
      {packs === null ? (
        <p data-testid="studio-recent-packs-unavailable">{RECENT_PACKS_UNAVAILABLE}</p>
      ) : packs.length === 0 ? (
        <p data-testid="studio-recent-packs-empty">{RECENT_PACKS_EMPTY}</p>
      ) : (
        <ul>
          {packs.map((p) => (
            <li key={p.attemptId}>
              <a
                href={savedPackHref(p.attemptId)}
                style={{ display: "inline-block", minHeight: "44px", paddingBlock: "var(--sp-2)" }}
              >
                {recentPackLinkText(p)}
              </a>{" "}
              <span className="muted">
                {p.modeLabel}, {formatSavedAt(p.createdAt)}
                {p.outcome === "honest_refusal" ? ", honest refusal" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The confirmation's identity: a different piece or version is a fresh mount. */
export function pieceKey(piece: { pieceId: string; version: number }): string {
  return `${piece.pieceId}:${piece.version}`;
}

export function StudioView({
  profileName,
  piece = null,
  pieceError = null,
  pieceCancelled = false,
  entrances = null,
  run,
  error,
  onboardingHref,
  brainActiveWithoutVoice,
  recentPacks,
}: StudioViewProps) {
  return (
    <section>
      <h1>Studio</h1>

      {error ? (
        <Banner title={error.title} data-testid="studio-action-error" role="alert">
          <p className="muted">{error.detail}</p>
        </Banner>
      ) : null}
      {pieceError ? (
        <Banner title={pieceError.title} data-testid="studio-piece-error" role="alert">
          <p className="muted">{pieceError.detail}</p>
        </Banner>
      ) : null}
      {pieceCancelled ? (
        <FocusedStatus testId="studio-piece-cancelled">{PIECE_CANCELLED_STATUS}</FocusedStatus>
      ) : null}
      {/*
        KEYED BY PIECE AND VERSION (L2 compliance note A-N3; the gate read the
        installed Next router): a search-param change keeps a client
        component's state, so without a key B's confirmation could show A's
        script. The version makes "New generation" a fresh mount too. The entrances are deliberately
        NOT keyed: their state is this profile's own concept batch, not the
        piece's, and choosing from it must not discard it.
      */}
      {piece ? (
        <PieceConfirmation key={pieceKey(piece.piece)} {...piece} />
      ) : null}
      {profileName !== null && entrances ? (
        <div className="panel" data-testid="studio-start">
          <h2 style={{ marginTop: 0 }}>Start something for {profileName}</h2>
          <StudioEntrances {...entrances} />
        </div>
      ) : null}

      {profileName === null ? (
        // A NAMED STATE, NOT AN ERROR. A creator with no profile has nothing to
        // generate for, and telling them where to start is the honest answer —
        // the same shape `/brain` uses for the same situation.
        <div className="panel" data-testid="studio-no-profile">
          <p style={{ margin: 0 }}>
            There is no creator profile selected for this workspace yet, so
            there is nobody to write as. Create one on the{" "}
            <a href={onboardingHref}>onboarding page</a>, add some of their
            posts, and activate a brain — then come back.
          </p>
        </div>
      ) : (
        <div className="panel" data-testid="studio-generate">
          <h2 style={{ marginTop: 0 }}>
            {entrances ? OTHER_MODES_HEADING : `Make something for ${profileName}`}
          </h2>
          {brainActiveWithoutVoice ? (
            <Banner title="Voice document needed" data-testid="studio-no-voice" role="status">
              <p className="muted">{VOICE_DOCUMENT_NEEDED}</p>
            </Banner>
          ) : null}
          {run ? <StudioPanel {...run} /> : null}
        </div>
      )}
      {profileName !== null && recentPacks !== undefined ? (
        <RecentPacks packs={recentPacks} />
      ) : null}
    </section>
  );
}
