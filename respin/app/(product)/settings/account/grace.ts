// The grace period the copy quotes, taken from the package rather than typed
// into a sentence, so the number on the page is the number the executor uses.
import { DELETION_GRACE_MS } from "@respin/db";

export const DELETION_GRACE_DAYS = Math.round(DELETION_GRACE_MS / (24 * 60 * 60 * 1000));
