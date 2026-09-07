import type { WriteBlock } from "./onboarding-view";
import { SubmitButton } from "./submit-button";

type FormAction = string | ((formData: FormData) => void | Promise<void>);

export type CreatorProfilePanelProps = {
  profiles: Array<{ id: string; displayName: string }>;
  selectedProfileId: string | null;
  selectProfileAction: FormAction;
  createProfileAction: FormAction;
  plan: { tier: string; cap: number; used: number } | null;
  capReached: boolean;
  createBlock: WriteBlock;
  nameLimit: number;
};

const control = {
  minHeight: 44,
  minWidth: 44,
  padding: "0.6rem 1rem",
  fontSize: "1rem",
} as const;

export function CreatorProfilePanel(props: CreatorProfilePanelProps) {
  const selected = props.profiles.find(
    (profile) => profile.id === props.selectedProfileId,
  );
  return (
    <section className="panel" aria-labelledby="creator-profile-title">
      <p className="eyebrow">Creator profile</p>
      <h2 id="creator-profile-title">
        {selected ? selected.displayName : "Choose a creator"}
      </h2>
      <form action={props.selectProfileAction}>
        <label htmlFor="active-profile">Creator profile</label>{" "}
        <select
          id="active-profile"
          name="profileId"
          required
          defaultValue={props.selectedProfileId ?? ""}
          style={control}
        >
          <option value="" disabled>
            Choose a creator
          </option>
          {props.profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.displayName}
            </option>
          ))}
        </select>{" "}
        <SubmitButton
          className="btn btn-secondary"
          pendingLabel="Switching creator…"
          style={control}
        >
          Switch profile
        </SubmitButton>
      </form>

      <h3>Add another creator</h3>
      {props.plan ? (
        <p className="muted">
          {props.plan.used} of {props.plan.cap} creator profiles used on the{" "}
          {props.plan.tier} plan.
        </p>
      ) : null}
      {props.capReached ? (
        <p className="muted">
          This plan&apos;s creator profile allowance is full. Change the plan
          on the billing page to add another creator.
        </p>
      ) : props.createBlock ? (
        <p className="muted">{props.createBlock.reason}</p>
      ) : (
        <form action={props.createProfileAction}>
          <label htmlFor="another-display-name">Creator name</label>{" "}
          <input
            id="another-display-name"
            name="displayName"
            type="text"
            required
            autoComplete="off"
            aria-describedby="another-display-name-limit"
            style={{ ...control, minWidth: "18rem" }}
          />{" "}
          <SubmitButton className="btn btn-primary" style={control}>
            Add creator
          </SubmitButton>
          <p id="another-display-name-limit" className="muted">
            One line of visible text, up to {props.nameLimit} characters.
          </p>
        </form>
      )}
    </section>
  );
}
