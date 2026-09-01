// /onboarding/interview — server component: gate, scope, read, render (slice
// 3b, Stage B1). Same discipline as `../page.tsx`: every read goes through a
// sanctioned surface (`respinDb`) and nothing else, and every decision this
// page could make inline instead lives in `./copy.ts` as a pure function.
//
// R11, RESUME: this page's whole job on GET is "what does the creator already
// have saved" — `respinDb.getInterviewDraft` — never an empty form defaulting
// to nothing. A SUBMITTED draft routes past the interview entirely (R13): its
// answers are fixed, and the confirm-and-activate surface for what they
// produced is `/brain`, not this screen.
import { requireUser } from "@respin/auth";
import { INTERVIEW_ANSWER_MAX, INTERVIEW_FIELDS, respinDb } from "@respin/db";
import { redirect } from "next/navigation";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { AccessRefusal } from "../../access-refusal";
import { billingErrorDisplay } from "../../billing-errors";
import { logRefusal } from "../../safe-log";
import { scopeForUser } from "../../workspace-scope";
import { fieldState, interviewErrorFor, INTERVIEW_LIST_ITEMS_MAX } from "./copy";
import { InterviewView } from "./interview-view";
import {
  saveInterviewReviewAction,
  saveInterviewStayAction,
  submitInterviewAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function InterviewPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Above the try, for the reason every other product page in this repo
  // states the same way: `requireUser()` refuses by THROWING a `redirect()`,
  // and catching it here would turn an expired session into an error banner.
  const user = await requireUser();
  const search = await props.searchParams;

  let scope: Awaited<ReturnType<typeof scopeForUser>>;
  try {
    scope = await scopeForUser(user);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[interview] workspace scope unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  let profiles: Awaited<ReturnType<typeof scope.accessors.creatorProfiles>>;
  try {
    profiles = await scope.accessors.creatorProfiles();
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[interview] profile list unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }
  // No profile yet: there is nothing to interview about — the create-profile
  // step lives on `/onboarding`, and this page has no form of its own for it.
  let profile: Awaited<
    ReturnType<typeof respinDb.selectedProfileForMember>
  > = null;
  try {
    profile = await respinDb.selectedProfileForMember(scope);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[interview] selected profile unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }
  if (!profile) {
    redirect(
      profiles.length === 0 ? "/onboarding" : "/onboarding?choose=profile",
    );
  }

  let draft: Awaited<ReturnType<typeof respinDb.getInterviewDraft>> = null;
  try {
    draft = await respinDb.getInterviewDraft(scope, profile.id);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[interview] draft unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  // SUBMITTED (R13): route past the interview. `/brain` is Stage B2's
  // confirm-and-activate surface for what this submission produced — this
  // file does not import anything from it, and does not render its own copy
  // of that screen.
  if (draft?.submittedAt) {
    return (
      <section>
        <h1>Your interview is submitted</h1>
        <p className="muted" data-testid="interview-submitted">
          Your answers are fixed now — resuming only applies before
          submission. What they produced is on the brain screen, where you
          review, correct and activate it.
        </p>
        <p>
          <a href="/brain" data-testid="interview-go-to-brain">
            Go to your creator brain
          </a>
        </p>
      </section>
    );
  }

  const fields = Object.fromEntries(
    INTERVIEW_FIELDS.map((f) => [f.key, fieldState(draft, f.key)])
  ) as Record<(typeof INTERVIEW_FIELDS)[number]["key"], ReturnType<typeof fieldState>>;

  const writeBlock =
    scope.role === "viewer"
      ? {
          reason:
            "You have viewer access to this workspace, so you cannot answer or submit this creator's interview. Ask a workspace owner for editor access.",
        }
      : null;

  const rawField = typeof search.field === "string" ? search.field : undefined;
  const errorCopy = interviewErrorFor(
    typeof search.e === "string" ? search.e : undefined,
    rawField
  );
  const errorField =
    errorCopy?.code === "interview_answer" &&
    rawField &&
    (INTERVIEW_FIELDS as readonly { key: string }[]).some((f) => f.key === rawField)
      ? (rawField as (typeof INTERVIEW_FIELDS)[number]["key"])
      : null;

  return (
    <InterviewView
      mode={search.step === "review" ? "review" : "edit"}
      profileName={profile.displayName}
      fields={fields}
      writeBlock={writeBlock}
      saveStayAction={saveInterviewStayAction.bind(null, profile.id)}
      saveReviewAction={saveInterviewReviewAction.bind(null, profile.id)}
      submitAction={submitInterviewAction.bind(null, profile.id)}
      error={errorCopy}
      errorField={errorField}
      answerMax={INTERVIEW_ANSWER_MAX}
      listMax={INTERVIEW_LIST_ITEMS_MAX}
    />
  );
}
