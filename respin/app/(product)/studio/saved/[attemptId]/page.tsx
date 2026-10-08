// /studio/saved/[attemptId] — THE SAVED RECORDING PACK (launch L4, R-153).
//
// Gate, scope, ONE READ, render. The read is `respinCredits.savedGeneration`:
// it builds no provider, claims nothing, writes no ledger row and takes no
// workspace money lock, so reopening a pack never re-enters the paid
// generation gate — whatever the balance, and under an open pause. Scoping is
// still a refusal path: a tombstoned identity, workspace or profile, a lost
// membership and another profile's attempt id all refuse here.
//
// `@respin/modes` is not imported (R-64): the stored output arrives already
// parsed by its own contract version inside the package, and this page only
// projects it (`savedPackFor`, the same projection a fresh draft uses).
//
// The two writes this page offers are courtesies over their authorities:
// "use this version" is refused by the piece's own role/pause/version gates,
// and a revision by every gate `generate` runs.
import { requireUser } from "@respin/auth";
import { respinDb } from "@respin/db";
import { SAVED_REVISION_OPTIONS, respinCredits } from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../../../../lib/next-control-flow";
import { AccessRefusal } from "../../../access-refusal";
import { billingErrorDisplay } from "../../../billing-errors";
import { logRefusal } from "../../../safe-log";
import { scopeForUser } from "../../../workspace-scope";
import { studioErrorFor, studioRefusalCopy } from "../../copy";
import { savedPackFor } from "../../projection";
import { reviseSavedAction, selectSavedVersionAction } from "../actions";
import { packFileName, recordingPackMarkdown, scriptText } from "../recording-pack";
import {
  SAVED_NO_PROFILE,
  SAVED_QUOTE_CHANGED,
  SAVED_STATE_COPY,
  reviseCostSentence,
  savedPressBlocks,
} from "../saved-copy";
import { SavedView } from "../saved-view";

export const dynamic = "force-dynamic";

export default async function SavedPackPage(props: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ABOVE the try: `requireUser()` refuses by throwing a `redirect()`.
  const user = await requireUser();
  const { attemptId: rawAttemptId } = await props.params;
  const search = await props.searchParams;
  // The segment arrives URL-decoded by the router; it is wire input until the
  // scoped read resolves it.
  const attemptId = typeof rawAttemptId === "string" ? rawAttemptId : "";

  let scope: Awaited<ReturnType<typeof scopeForUser>>;
  try {
    scope = await scopeForUser(user);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[saved] workspace scope unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  let profile: Awaited<ReturnType<typeof respinDb.selectedProfileForMember>> = null;
  try {
    profile = await respinDb.selectedProfileForMember(scope);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[saved] selected profile unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }
  if (!profile) {
    return <SavedView kind="state" copy={{ title: "No creator profile", detail: SAVED_NO_PROFILE }} />;
  }

  let read: Awaited<ReturnType<typeof respinCredits.savedGeneration>>;
  try {
    read = await respinCredits.savedGeneration(scope, profile.id, attemptId);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[saved] saved generation unavailable", err, {
      profileId: profile.id,
      workspaceId: scope.workspaceId,
    });
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  if (read.status !== "saved") {
    const copy =
      read.status === "missing"
        ? SAVED_STATE_COPY.missing
        : read.status === "pending"
          ? SAVED_STATE_COPY.pending
          : read.status === "not_stored"
            ? read.claim === "refused"
              ? SAVED_STATE_COPY.not_stored_refused
              : SAVED_STATE_COPY.not_stored_recovery
            : read.reason === "unsupported_contract"
              ? SAVED_STATE_COPY.unreadable_unsupported
              : SAVED_STATE_COPY.unreadable_corrupt;
    return <SavedView kind="state" copy={copy} />;
  }

  const view = read.view;
  const pack = savedPackFor(view);

  // THE WRITE COURTESIES — never the gates. The pause is read from its
  // authority (`hasOpenPause`, `pause_periods`), and a failed read leaves the
  // controls offered so the server's own gate answers with copy.
  let paused = false;
  try {
    paused = await respinCredits.hasOpenPause(scope.workspaceId);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[saved] pause state unavailable", err);
  }
  const blocks = savedPressBlocks({
    blocked: view.revision.blocked,
    credits: view.revision.credits,
    inPlan: view.revision.inPlan,
    isViewer: scope.role === "viewer",
    paused,
  });

  // THE QUOTE REFUSAL SAYS WHAT THIS PAGE OFFERS: the shared copy for
  // `generation_quote_changed` is the piece confirmation's ("press New
  // generation"), which would send a creator here to a control that is not on
  // this page. Same code, same class; this page's own sentence.
  const refusalCopy: Record<string, { title: string; detail: string }> = {
    ...studioRefusalCopy(),
    generation_quote_changed: SAVED_QUOTE_CHANGED,
  };
  const errorParam = typeof search.e === "string" ? search.e : undefined;

  return (
    <SavedView
      kind="pack"
      pack={pack}
      scriptText={scriptText(pack)}
      markdown={recordingPackMarkdown(pack)}
      fileName={packFileName(pack)}
      selectAction={
        view.piece !== null && view.piece.selectable && blocks.select === null
          ? selectSavedVersionAction.bind(null, profile.id, view.attemptId, view.piece.pieceId)
          : null
      }
      selectBlock={blocks.select}
      reviseAction={reviseSavedAction.bind(null, profile.id, view.attemptId)}
      reviseOptions={SAVED_REVISION_OPTIONS}
      reviseCostSentence={reviseCostSentence(view.revision.credits, view.createdAt)}
      reviseBlock={blocks.revise}
      // THE READ DECIDES, NOT THE LINK: `?selected=1` on a crafted or stale
      // link over a version that is not the selected one says nothing.
      selectedStatus={search.selected === "1" && view.piece?.isSelected === true}
      error={studioErrorFor(errorParam)}
      refusalCopy={refusalCopy}
      fallbackCopy={refusalCopy.unknown}
    />
  );
}
