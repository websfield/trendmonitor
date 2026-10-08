// THE CONTACT SENTENCES, AS PURE FUNCTIONS OF THE SUPPORT ADDRESS (audit P6-R6
// amendment; decisions R-176, plan label R-159).
//
// NO IMPORTS AND NO ENVIRONMENT READ: the address arrives as an argument from a
// server caller that read it through `./support-contact.ts`, so this module is
// safe in a client bundle and every branch is drivable from a test. `null`
// means no channel is configured, and then no sentence here promises one.

/**
 * The line appended to a refusal whose remedy, once the creator's own options
 * are spent, is a person. Empty when there is no channel.
 */
export function contactSentence(support: string | null): string {
  return support === null ? "" : `If it keeps happening, email ${support}.`;
}

/**
 * `detail` with the contact line appended when there is a channel, and
 * unchanged when there is not. One space between, never a dangling one.
 */
export function withContact(detail: string, support: string | null): string {
  const line = contactSentence(support);
  return line === "" ? detail : `${detail} ${line}`;
}

/** `/api/export`'s plain-text failure body (a route file may export only handlers). */
export function exportFailedText(support: string | null): string {
  return withContact("The export could not be prepared. Try again.", support);
}

/**
 * `/usage`'s note under a charge whose draft never settled. Before R-176 it
 * ended by sending the creator to support "with this page open", with no
 * channel to send them to.
 */
export function unsettledChargeNote(support: string | null): string {
  const base =
    "One or more charges name a draft that never finished settling, so we cannot say which mode they belong to. Nothing is guessed into a mode.";
  return support === null
    ? base
    : `${base} To ask about it, email ${support} with this page open.`;
}
