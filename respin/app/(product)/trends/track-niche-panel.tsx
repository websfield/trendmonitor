"use client";

import { useActionState } from "react";
import { buttonClass } from "../../ui/button";
import { SubmitButton } from "../onboarding/submit-button";
import {
  IDLE_TRACK_NICHE_STATE,
  type TrackNicheActionState,
} from "./track-state";

type TrackNichePanelProps = Readonly<{
  tracked: readonly Readonly<{ id: string; niche: string }>[];
  action: (
    previous: TrackNicheActionState,
    formData: FormData
  ) => Promise<TrackNicheActionState>;
  untrackAction: (
    previous: TrackNicheActionState,
    formData: FormData
  ) => Promise<TrackNicheActionState>;
}>;

export function TrackNichePanel({ tracked, action, untrackAction }: TrackNichePanelProps) {
  const [state, formAction, pending] = useActionState(action, IDLE_TRACK_NICHE_STATE);
  const [removeState, removeFormAction, removing] = useActionState(
    untrackAction,
    IDLE_TRACK_NICHE_STATE
  );
  return (
    <section className="panel" aria-labelledby="track-niche-heading">
      <h2 id="track-niche-heading">Track a niche</h2>
      <p className="muted">
        Tracking follows this profile and its plan limit. Eligible items appear only after a compliant refresh and autopsy complete.
      </p>
      <form action={formAction}>
        <p>
          <label htmlFor="tracked-niche">Niche</label>
          <br />
          <input
            id="tracked-niche"
            name="niche"
            required
            maxLength={80}
            autoComplete="off"
          />
        </p>
        <SubmitButton className={buttonClass("secondary")} pendingLabel="Saving niche...">
          Track niche
        </SubmitButton>
      </form>
      {tracked.length > 0 ? (
        <div>
          <h3>Tracked now</h3>
          <ul>
            {tracked.map((row) => (
              <li key={row.id}>
                <span>{row.niche}</span>{" "}
                <form action={removeFormAction} style={{ display: "inline" }}>
                  <input type="hidden" name="trackedNicheId" value={row.id} />
                  <SubmitButton
                    className={buttonClass("secondary")}
                    pendingLabel="Removing..."
                  >
                    Remove
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted">No niches are tracked for this profile yet.</p>
      )}
      <p role="status" aria-live="polite" className="muted" style={{ minHeight: "1.2em" }}>
        {pending
          ? "Saving niche..."
          : state.status === "saved"
            ? "Niche saved. New eligible items appear after a compliant scheduled refresh."
            : state.status === "refused"
              ? "This niche was not saved. Nothing was charged."
              : ""}
      </p>
      <p role="status" aria-live="polite" className="muted" style={{ minHeight: "1.2em" }}>
        {removing
          ? "Removing niche..."
          : removeState.status === "removed"
            ? "Niche removed. Its plan slot is available again."
            : removeState.status === "refused"
              ? "This niche was not removed."
              : ""}
      </p>
    </section>
  );
}
