// THE ONE READ OF THE SUPPORT ADDRESS (audit P6-R6 amendment; decisions R-176,
// plan label R-159).
//
// Before this module every sentence sending a creator to support promised
// a channel that did not exist: the card measured 47 phrasings across nine
// files on 2026-09-20 and found no address, no `mailto:` and no `/support`
// route. R-176's answer is one operator-set address, read here and nowhere
// else, on the server only. The copy that used to promise contact now names
// this address when it is set and promises nothing when it is not
// (`./support-copy.ts`), so the product can never send a creator to a channel
// nobody operates.
//
// SERVER-ONLY BY ITS IMPORTERS, and that is checked rather than claimed:
// `tests/support-contact.test.tsx` asserts that no module carrying a
// `"use client"` directive imports this file, and that this is the only
// production module naming the variable.

/** The variable an operator sets (`env.example` documents it). */
export const SUPPORT_EMAIL_ENV = "RESPIN_SUPPORT_EMAIL";

/** The longest address RFC 5321 lets a mailbox path carry. */
const ADDRESS_MAX = 254;

/**
 * One address, nothing else: a local part, an `@`, a domain with a dot, and
 * none of the characters that would let the value become markup, a header or
 * a second address when it is printed into a sentence.
 */
const ADDRESS_SHAPE = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\].]+$/;

/**
 * The support address, or `null` when none is configured.
 *
 * FAILS CLOSED TO "NO CHANNEL": an unset, blank, oversized or malformed value
 * is `null`, which makes every contact sentence withdraw its promise rather
 * than print an address nobody can write to. `env` is a parameter so a test
 * can drive both states without mutating `process.env`.
 */
export function supportContact(
  env: Readonly<Record<string, string | undefined>> = process.env
): string | null {
  const raw = env[SUPPORT_EMAIL_ENV];
  if (typeof raw !== "string") return null;
  const address = raw.trim();
  if (address.length === 0 || address.length > ADDRESS_MAX) return null;
  return ADDRESS_SHAPE.test(address) ? address : null;
}
