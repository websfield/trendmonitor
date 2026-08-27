// Typed refusals owned by @respin/db.
//
// `WorkspacePausedError` MOVED here from @respin/credits on 2026-08-21 (plan
// A-7). The reason is a dependency fact, not a preference: `writeBrainDoc`
// lives in packages/db and must refuse under an open pause, `pause_periods` is
// defined in packages/db (`billing-schema.ts`), and @respin/credits depends on
// @respin/db — so a credits-owned error class would have made the refusal
// either impossible or duplicated. A duplicate class is worse than either: two
// `WorkspacePausedError`s fail `instanceof` against each other, and the app's
// error map matches on `instanceof`, so the pause refusal would have rendered
// as "Something went wrong" — the exact outcome the move exists to prevent.
//
// @respin/credits re-exports it, so every existing import site is unchanged.

export class WorkspacePausedError extends Error {
  constructor() {
    super(
      "Workspace subscription is paused: credits are frozen and debits are refused until resume (REQ-G08)."
    );
    this.name = "WorkspacePausedError";
  }
}

/**
 * The profile equivalent of WorkspaceAccessError.
 *
 * ITS MESSAGE CARRIES NO IDENTIFIER, deliberately and permanently. A message
 * that distinguished "this profile is not yours" from "this profile does not
 * exist" would be an enumeration oracle over every workspace's profile ids —
 * so foreign, nonexistent and malformed ids all raise this one message,
 * byte-identical, and a test asserts it with `toBe` rather than `toMatch`.
 */
export class ProfileAccessError extends Error {
  constructor() {
    super(
      "That creator profile is not available in this workspace (REQ-A03). If you believe it should be, ask the workspace owner to check the profile list."
    );
    this.name = "ProfileAccessError";
  }
}

/**
 * A `source_evidence` entry that does not survive validation against the input
 * it cites — offsets outside the stored content, or a quote that is not
 * verbatim at those offsets.
 *
 * SEPARATE from ProfileAccessError on purpose, and safe to name precisely: by
 * the time this fires the input has already been proven to belong to THIS
 * profile, so the message reveals nothing about what else exists. Collapsing
 * the two would have made a fabricated quote indistinguishable from an
 * unauthorised one in the log — and REQ-B02's whole subject is provenance, so
 * the one refusal that means "this warrant is invented" gets its own name.
 */
export class ProvenanceError extends Error {
  constructor(detail: string) {
    super(
      `Source evidence rejected: ${detail}. Every quote must be verbatim at its recorded UTF-16 offsets into the stored, normalised onboarding input (REQ-B02) — an invented quote carries a fabricated warrant, so it is refused rather than stored.`
    );
    this.name = "ProvenanceError";
  }
}

/**
 * A `usage_raw` value that could carry text.
 *
 * `model_usage.usage_raw` is excluded from the REQ-A04 export on the ground
 * that it holds metering fields only — so that ground has to be enforced, not
 * asserted. This is the refusal that enforces it.
 */
export class UsageRawError extends Error {
  constructor(found: string) {
    super(
      `usage_raw rejected: it contains ${found}. This column records METERING ONLY — never prompt or completion text — because the REQ-A04 export excludes it on exactly that basis. Record token counts and flags; if a provider returns a field this refuses, give it its own column.`
    );
    this.name = "UsageRawError";
  }
}

/**
 * A value shaped like a scope that this module did not mint.
 *
 * This is never a user's mistake and never something a user can trigger: a
 * scope reaches a capability only by being minted, so this class means a
 * forgery attempt or a genuine programming error. Its copy says so instead of
 * offering the reader a button that cannot help them.
 */
export class ScopeForgeryError extends Error {
  constructor(what: string) {
    super(
      `${what} was not minted by @respin/db. Scopes are minted only by withWorkspace / ProfileScope.mint; a spread, a cast, an Object.assign, a Proxy, a subclass or a Reflect.construct is not a scope (REQ-A03).`
    );
    this.name = "ScopeForgeryError";
  }
}

/**
 * A role refusal on the two acts that decide what the product BELIEVES about a
 * creator: confirming a brain document's fields, and activating a version.
 *
 * SEPARATE from `ProfileAccessError`, deliberately. That error is one fixed
 * message for foreign, nonexistent and malformed profile ids alike, because a
 * distinguishable refusal there is an enumeration oracle (P2). This one leaks
 * nothing: it tells a caller about their OWN role, which they already know, and
 * saying so is the difference between a usable refusal and "not available".
 */
export class BrainRoleError extends Error {
  constructor(act: string, role: string) {
    super(
      `A ${role} cannot ${act} a brain document. Confirming and activating decide what the product believes about this creator and act on it, so they need at least editor access (REQ-A02). Ask a workspace owner.`
    );
    this.name = "BrainRoleError";
  }
}
