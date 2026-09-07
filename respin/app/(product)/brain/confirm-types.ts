// The shape one confirmation takes on the wire.
//
// ITS OWN DIRECTIVE-FREE MODULE for the same reason `./confirmations.ts` is
// one: a `"use server"` file may export only async functions, so neither the
// parse nor its type can live in `./actions.ts`. The onboarding folder's
// `run-state.ts` is the precedent.
//
// It mirrors `ConfirmBrainDocParams["confirmedFields"]`'s element rather than
// importing it, because `@respin/db` exports that type through the package root
// and app/** may name it — but the entry a FORM produces is a different thing
// from the entry the capability accepts: this one is what a browser sent us,
// and the capability's is what the server decided to store after validating it.
// Keeping them nominally separate is what stops the second silently inheriting
// the first's trust.
export type ConfirmedFieldSubmission = {
  /** RFC-6901 pointer naming the claim position the creator ticked. */
  pointer: string;
  /**
   * The placeholder state the SCREEN DISPLAYED, not one derived here (R12).
   *
   * `confirmBrainDocFields` compares it against the stored content and refuses
   * a disagreement, which is what makes "a document that changed under the
   * reader" a named refusal instead of a silent confirmation of something they
   * never saw.
   */
  asPlaceholder: boolean;
};
