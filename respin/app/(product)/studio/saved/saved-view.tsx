// THE SAVED RECORDING PACK — PURE presentation (launch L4, R-153).
//
// The page does the gate, the scope and the one read; this renders what it is
// handed, so every state (a usable pack, an honest refusal, a legacy draft,
// unreadable checks, a missing, pending, unsaved or unreadable draft, a
// viewer, a paused workspace, a plan without the mode) is reachable from a
// test with a fixture.
//
// ONE VERSION, ONE PROJECTION, EVERY WIDTH. The phone and the desktop read the
// same `SavedPackView`: the reference a Spin or a source reel was made from,
// the script and the shooting plan sit in one grid whose columns collapse to
// one below ~22rem, so the original and the draft read side by side where
// there is room and there is no second "mobile" tree to drift from the first.
// The sections are `../generation-outcome.tsx`'s own exported renderers, so a
// stored draft's words read here as they read when it was made — minus the
// model's disclosure, which the facade replaced, and the scoring model's rule
// notes, which the facade dropped for the creator's own rule text.
import { Banner } from "../../../ui/banner";
import { Badge } from "../../../ui/badge";
import { buttonClass } from "../../../ui/button";
import { SubmitButton } from "../../onboarding/submit-button";
import { FocusedStatus } from "../focus";
import {
  CreativeHeader,
  FilmingNeeds,
  KillTestBlock,
  OnScreenAndCaption,
  ScriptSections,
  WhyThisPerforms,
} from "../generation-outcome";
import { savedPackHref } from "../run-copy";
import type { SavedPackView, SavedReviseState } from "../run-state";
import { PackActions } from "./pack-actions";
import { packChecks } from "./recording-pack";
import { RevisePanel } from "./revise-panel";
import {
  CHECKS_HEADING,
  CHECKS_UNREADABLE,
  CHECK_LEGEND,
  DISCLOSURE_ADVICE_WITHHELD,
  DISCLOSURE_HEADING,
  LINEAGE_HEADING,
  NOTHING_TO_EXPORT,
  NOT_A_PIECE_NOTE,
  NO_SHOOTING_PLAN,
  OPEN_PARENT_LABEL,
  OPEN_SELECTED_LABEL,
  OPEN_SOURCE_LABEL,
  ORIGINAL_NOTE,
  ORIGINAL_REFERENCE_HEADING,
  PACK_ACTIONS_HEADING,
  PIECE_OTHER_SELECTED_SENTENCE,
  PIECE_SELECTED_SENTENCE,
  REFERENCE_HEADING,
  REFERENCE_UNAVAILABLE,
  REFUSED_VERSION_BADGE,
  REVISIONS_HEADING,
  REVISIONS_TRUNCATED_NOTE,
  SAVED_HEADING,
  SAVED_READ_FREE,
  SCRIPT_HEADING,
  SELECTED_BADGE,
  SELECTED_STATUS,
  SHOOTING_PLAN_HEADING,
  SHOT_CHECKLIST_NOTE,
  SOURCE_CHECKED_REVISED,
  SOURCE_CHECKED_SOURCE,
  SOURCE_HEADING,
  SOURCE_TRUNCATED_NOTE,
  SOURCE_UNAVAILABLE,
  SPIN_GATE_PASSED,
  THIS_VERSION_BADGE,
  USE_THIS_VERSION_HELP,
  USE_THIS_VERSION_LABEL,
  USE_THIS_VERSION_PENDING,
  VERSIONS_HEADING,
  VERSIONS_TRUNCATED_NOTE,
  formatSavedAt,
  revisedFromSentence,
  savedSubtitle,
  sourceSentence,
  versionLinkLabel,
  type SavedStateCopy,
} from "./saved-copy";

// SPACING FROM THE TOKENS (`respin-tokens.css` `--sp-*`, accessibility C5);
// the 44px target size and the checkbox size are sizes, not spacing.
const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "var(--sp-2) var(--sp-4)",
  fontSize: "1rem",
};

const link: React.CSSProperties = {
  display: "inline-block",
  minHeight: "44px",
  paddingBlock: "var(--sp-2)",
};

export type SavedPackProps = {
  kind: "pack";
  pack: SavedPackView;
  scriptText: string;
  markdown: string;
  fileName: string;
  /** "Use this version", bound to this version and piece; null when not offered. */
  selectAction: ((formData: FormData) => Promise<void>) | null;
  reviseAction: (prev: SavedReviseState, formData: FormData) => Promise<SavedReviseState>;
  reviseOptions: readonly { id: string; label: string }[];
  /** The revision price and parent, in words. */
  reviseCostSentence: string;
  /** Why the revise presses are not offered, or null. */
  reviseBlock: string | null;
  /** Why "use this version" is not offered (viewer, paused), or null. */
  selectBlock: string | null;
  /** `?selected=1` AND the read says this version is the selected one. */
  selectedStatus: boolean;
  /** Copy for a `?e=` code a refused press redirected back with. */
  error: { title: string; detail: string } | null;
  refusalCopy: Readonly<Record<string, { title: string; detail: string }>>;
  fallbackCopy: { title: string; detail: string };
};

export type SavedStateProps = { kind: "state"; copy: SavedStateCopy };

export type SavedViewProps = SavedPackProps | SavedStateProps;

function Header({ subtitle }: { subtitle: string | null }) {
  return (
    <>
      <p style={{ margin: 0 }}>
        <a href="/studio" style={link}>
          Back to Studio
        </a>
      </p>
      <h1>{SAVED_HEADING}</h1>
      {subtitle !== null ? (
        <p className="muted" data-testid="saved-subtitle">
          {subtitle}
        </p>
      ) : null}
    </>
  );
}

/** This version's own revisions, newest first (R-153 amendment, billing M2). */
function Revisions({ pack }: { pack: SavedPackView }) {
  if (pack.revisions.length === 0) return null;
  return (
    <>
      <h3 style={{ marginBottom: "var(--sp-1)" }}>{REVISIONS_HEADING}</h3>
      <ul data-testid="saved-revisions">
        {pack.revisions.map((r) => (
          <li key={r.attemptId} style={{ marginBottom: "var(--sp-1)" }}>
            <a href={savedPackHref(r.attemptId)} style={link}>
              {`Revision saved ${formatSavedAt(r.createdAt)}`}
            </a>{" "}
            {r.outcome === "honest_refusal" ? (
              <Badge variant="dashed">{REFUSED_VERSION_BADGE}</Badge>
            ) : null}
          </li>
        ))}
      </ul>
      {pack.revisionsTruncated ? (
        <p className="muted" data-testid="saved-revisions-truncated">
          {REVISIONS_TRUNCATED_NOTE}
        </p>
      ) : null}
    </>
  );
}

/** Where this version came from, its piece, and every version of that piece. */
function Lineage({ props }: { props: SavedPackProps }) {
  const { pack } = props;
  const piece = pack.piece;
  return (
    <section className="panel" aria-labelledby="saved-lineage-heading" data-testid="saved-lineage">
      <h2 id="saved-lineage-heading" style={{ marginTop: 0 }}>
        {LINEAGE_HEADING}
      </h2>
      {pack.lineage.parent ? (
        <p data-testid="saved-parent">
          {revisedFromSentence(pack.lineage.parent.modeLabel)}{" "}
          <a href={savedPackHref(pack.lineage.parent.attemptId)} style={link}>
            {OPEN_PARENT_LABEL}
          </a>
        </p>
      ) : (
        <p data-testid="saved-original">{ORIGINAL_NOTE}</p>
      )}
      {pack.lineage.source ? (
        <p data-testid="saved-source">
          {sourceSentence(pack.lineage.source.ideaIndex)}{" "}
          <a href={savedPackHref(pack.lineage.source.attemptId)} style={link}>
            {OPEN_SOURCE_LABEL}
          </a>
        </p>
      ) : null}
      <Revisions pack={pack} />
      {piece === null ? (
        <p className="muted" data-testid="saved-not-a-piece">
          {NOT_A_PIECE_NOTE}
        </p>
      ) : (
        <>
          <p data-testid="saved-selection">
            <strong>
              {piece.isSelected ? PIECE_SELECTED_SENTENCE : PIECE_OTHER_SELECTED_SENTENCE}
            </strong>{" "}
            {!piece.isSelected && piece.selectedAttemptId !== null ? (
              <a href={savedPackHref(piece.selectedAttemptId)} style={link}>
                {OPEN_SELECTED_LABEL}
              </a>
            ) : null}
          </p>
          {piece.selectable && props.selectAction !== null ? (
            <form action={props.selectAction} data-testid="saved-select-form">
              <input type="hidden" name="version" value={String(piece.version)} />
              <SubmitButton
                className={buttonClass("primary")}
                style={control}
                pendingLabel={USE_THIS_VERSION_PENDING}
                ariaDescribedBy="saved-select-help"
              >
                {USE_THIS_VERSION_LABEL}
              </SubmitButton>
              <p className="muted" id="saved-select-help">
                {USE_THIS_VERSION_HELP}
              </p>
            </form>
          ) : piece.selectable && props.selectBlock !== null ? (
            <p className="muted" data-testid="saved-select-block">
              {props.selectBlock}
            </p>
          ) : null}
          <h3 style={{ marginBottom: "var(--sp-1)" }}>{VERSIONS_HEADING}</h3>
          <ol data-testid="saved-versions">
            {piece.versions.map((v, i) => (
              <li key={v.attemptId} style={{ marginBottom: "var(--sp-1)" }}>
                {/* AN ORDINAL IN THE NAME (accessibility C3): two versions
                    saved in the same minute are still two different links. */}
                {v.isThis ? (
                  <span aria-current="page">{versionLinkLabel(i + 1, v.createdAt)}</span>
                ) : (
                  <a href={savedPackHref(v.attemptId)} style={link}>
                    {versionLinkLabel(i + 1, v.createdAt)}
                  </a>
                )}{" "}
                {v.isSelected ? <Badge variant="filled">{SELECTED_BADGE}</Badge> : null}{" "}
                {v.isThis ? <Badge variant="outline">{THIS_VERSION_BADGE}</Badge> : null}{" "}
                {v.outcome === "honest_refusal" ? (
                  <Badge variant="dashed">{REFUSED_VERSION_BADGE}</Badge>
                ) : null}
              </li>
            ))}
          </ol>
          {piece.versionsTruncated ? (
            <p className="muted" data-testid="saved-versions-truncated">
              {VERSIONS_TRUNCATED_NOTE}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * WHAT A SPIN OR A SOURCE REEL WAS MADE FROM (R-153 amendment A2) — the
 * `/trends` `SpinOutcome` arrangement: the original beside the draft, in the
 * same grid. The "passed the similarity check" line is said only over a
 * stored USABLE Spin (an honest refusal stored no draft), and a source reel's
 * line names the text its stored copy check actually read.
 */
function Reference({ pack }: { pack: SavedPackView }) {
  const ref = pack.reference;
  if (ref === null) return null;
  const usable = pack.document !== null;
  return (
    <section className="panel" aria-labelledby="saved-reference-heading" data-testid="saved-reference">
      <h2 id="saved-reference-heading" style={{ marginTop: 0 }}>
        {REFERENCE_HEADING}
      </h2>
      {ref.kind === "spin" ? (
        ref.summary === null ? (
          <p data-testid="saved-reference-unavailable">{REFERENCE_UNAVAILABLE}</p>
        ) : (
          <>
            <h3 style={{ marginBottom: "var(--sp-1)" }}>{ORIGINAL_REFERENCE_HEADING}</h3>
            <p>
              {ref.summary.source}: {ref.summary.title}
            </p>
            <p>{ref.summary.mechanismSummary}</p>
            {usable ? <p data-testid="saved-reference-gate">{SPIN_GATE_PASSED}</p> : null}
          </>
        )
      ) : (
        <>
          <h3 style={{ marginBottom: "var(--sp-1)" }}>{SOURCE_HEADING}</h3>
          {ref.text === null ? (
            <p data-testid="saved-reference-unavailable">{SOURCE_UNAVAILABLE}</p>
          ) : (
            <>
              <p style={{ whiteSpace: "pre-wrap" }} data-testid="saved-reference-source">
                {ref.text}
              </p>
              {ref.truncated ? <p className="muted">{SOURCE_TRUNCATED_NOTE}</p> : null}
            </>
          )}
          {usable ? (
            <p data-testid="saved-reference-gate">
              {ref.checkedAgainst === "source" ? SOURCE_CHECKED_SOURCE : SOURCE_CHECKED_REVISED}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/** The shot map as a checklist; the filming needs above it. */
function ShootingPlan({ pack }: { pack: SavedPackView }) {
  const doc = pack.document;
  const plan = doc?.creative?.script;
  const shots = doc?.shotMap;
  return (
    <section className="panel" aria-labelledby="saved-plan-heading" data-testid="saved-shooting-plan">
      <h2 id="saved-plan-heading" style={{ marginTop: 0 }}>
        {SHOOTING_PLAN_HEADING}
      </h2>
      {plan ? <FilmingNeeds line={plan} /> : null}
      {shots ? (
        <>
          <p className="muted">{SHOT_CHECKLIST_NOTE}</p>
          <ul data-testid="saved-shot-checklist" style={{ listStyle: "none", paddingLeft: 0 }}>
            {shots.map((s, i) => (
              <li key={i}>
                <label style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-start", minHeight: "44px", paddingBlock: "var(--sp-2)" }}>
                  <input type="checkbox" style={{ width: "24px", height: "24px", flex: "none", marginTop: "var(--sp-1)" }} />
                  <span>
                    <strong>Beat {s.beatIndex + 1}:</strong> {s.shot}
                    <br />
                    <span className="muted">{s.note}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {!plan && !shots ? (
        <p className="muted" data-testid="saved-no-plan">
          {NO_SHOOTING_PLAN}
        </p>
      ) : null}
    </section>
  );
}

function Checks({ pack }: { pack: SavedPackView }) {
  const doc = pack.document;
  const open = packChecks(pack);
  return (
    <section className="panel" aria-labelledby="saved-checks-heading" data-testid="saved-checks" style={{ marginTop: "var(--sp-4)" }}>
      <h2 id="saved-checks-heading" style={{ marginTop: 0 }}>
        {CHECKS_HEADING}
      </h2>
      {open.length > 0 ? (
        <>
          <h3 style={{ marginBottom: "var(--sp-1)" }}>Before you film</h3>
          <ul data-testid="saved-open-checks">
            {open.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
      {pack.checks !== null ? (
        <KillTestBlock summary={pack.checks} showDisclosureProvenance={false} />
      ) : (
        <p data-testid="saved-checks-unreadable">{CHECKS_UNREADABLE}</p>
      )}
      {doc ? <WhyThisPerforms section={doc.whyThisPerforms} /> : null}
      <h3 style={{ marginBottom: "var(--sp-1)" }}>{DISCLOSURE_HEADING}</h3>
      <p data-testid="saved-disclosure">{pack.disclosureGuidance}</p>
      <p className="muted" data-testid="saved-check-legend">
        {CHECK_LEGEND}
      </p>
    </section>
  );
}

function Refusal({ pack }: { pack: SavedPackView }) {
  const refusal = pack.refusal;
  if (refusal === null) return null;
  return (
    <section className="panel" data-testid="saved-refusal" aria-labelledby="saved-refusal-heading">
      <h2 id="saved-refusal-heading" style={{ marginTop: 0 }}>
        {refusal.headline ?? "This version ended in an honest refusal"}
      </h2>
      {refusal.hardRules.length > 0 ? (
        <ul data-testid="saved-refusal-why">
          {refusal.hardRules.map((h, i) => (
            <li key={i}>
              {h.rule} at {h.field}: {h.remedy}
            </li>
          ))}
        </ul>
      ) : null}
      {/* A REASON THAT WAS WITHHELD IS SAID, never left silent (A6). */}
      {pack.disclosureAdviceWithheld ? (
        <p data-testid="saved-refusal-disclosure-withheld">{DISCLOSURE_ADVICE_WITHHELD}</p>
      ) : null}
      {refusal.sharperAngle !== null ? (
        <p data-testid="saved-sharper-angle">
          <strong>A sharper angle:</strong> {refusal.sharperAngle}
        </p>
      ) : null}
    </section>
  );
}

export function SavedView(props: SavedViewProps) {
  if (props.kind === "state") {
    return (
      <section data-testid="saved-state">
        <Header subtitle={null} />
        <Banner title={props.copy.title} role="status" data-testid="saved-state-banner">
          <p className="muted">{props.copy.detail}</p>
        </Banner>
      </section>
    );
  }
  const { pack } = props;
  const latestRevision = pack.revisions[0] ?? null;
  return (
    <section data-testid="saved-pack">
      <Header subtitle={savedSubtitle(pack.modeLabel, pack.createdAt)} />
      {props.error ? (
        <Banner title={props.error.title} role="alert" data-testid="saved-error">
          <p className="muted">{props.error.detail}</p>
        </Banner>
      ) : null}
      {props.selectedStatus ? (
        <FocusedStatus testId="saved-selected-status">{SELECTED_STATUS}</FocusedStatus>
      ) : null}
      <p className="muted" data-testid="saved-read-free">
        {SAVED_READ_FREE}
      </p>
      <Lineage props={props} />
      {pack.document === null ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))",
            gap: "var(--sp-4)",
            marginTop: "var(--sp-4)",
            alignItems: "start",
          }}
        >
          <Reference pack={pack} />
          <Refusal pack={pack} />
        </div>
      ) : (
        <div
          data-testid="saved-columns"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))",
            gap: "var(--sp-4)",
            marginTop: "var(--sp-4)",
            alignItems: "start",
          }}
        >
          <Reference pack={pack} />
          <section className="panel" aria-labelledby="saved-script-heading" data-testid="saved-script">
            <h2 id="saved-script-heading" style={{ marginTop: 0 }}>
              {SCRIPT_HEADING}
            </h2>
            <CreativeHeader doc={pack.document} showScriptFilming={false} />
            <ScriptSections doc={pack.document} />
            <OnScreenAndCaption doc={pack.document} />
          </section>
          <ShootingPlan pack={pack} />
        </div>
      )}
      <Checks pack={pack} />
      <section className="panel" aria-labelledby="saved-export-heading" data-testid="saved-export" style={{ marginTop: "var(--sp-4)" }}>
        <h2 id="saved-export-heading" style={{ marginTop: 0 }}>
          {PACK_ACTIONS_HEADING}
        </h2>
        {pack.document !== null ? (
          <PackActions scriptText={props.scriptText} markdown={props.markdown} fileName={props.fileName} />
        ) : (
          <p className="muted" data-testid="saved-nothing-to-export">
            {NOTHING_TO_EXPORT}
          </p>
        )}
      </section>
      <RevisePanel
        action={props.reviseAction}
        options={props.reviseOptions}
        costSentence={props.reviseCostSentence}
        block={props.reviseBlock}
        quoteConfigVersion={pack.revision.quoteConfigVersion}
        latestRevision={latestRevision}
        refusalCopy={props.refusalCopy}
        fallbackCopy={props.fallbackCopy}
      />
    </section>
  );
}
