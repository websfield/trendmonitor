// /recover-deletion — the page the identity-deletion recovery email links to.
// Public by design: the reader has no session. The form carries the link's two
// values and asks for the password, and POST /api/deletion/recover does the
// rest.
//
// AFTER A CANCELLATION it reads ONE thing (R-162, P5-R6): the bounded status
// receipt the cancellation minted, through `readIdentityCancellationStatus` —
// the reader that function never had. Before, the route redirected with a bare
// restored-COUNT, so a membership the cancellation could not restore (its
// workspace being erased) rendered as "No memberships were restored": a hard
// strand shown as a benign line. The receipt is single-purpose, expires ten
// minutes after it is issued, and is compared in constant time by the reader;
// an expired or wrong one renders the plain cancelled line, never counts.
import { cookies } from "next/headers";
import { respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { RECOVERY_RECEIPT_COOKIE } from "../../../lib/routes";
import { buttonClass } from "../../ui/button";

const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const RECEIPT_RE = /^[A-Za-z0-9_-]{43}$/;

/** One sentence per conflict outcome the cancellation can record. A list: a new outcome is an edit here. */
const CONFLICT_COPY: Readonly<Record<string, (count: number) => string>> = {
  workspace_unavailable: (n) =>
    `${n} membership(s) could not be restored: the workspace is being erased or no longer exists.`,
  removed: (n) => `${n} membership(s) could not be restored: the membership was removed while the deletion was pending.`,
  changed: (n) => `${n} membership(s) could not be restored: the membership changed while the deletion was pending.`,
  seat_refused: (n) => `${n} membership(s) could not be restored: the workspace has no seat available.`,
};

function conflictLines(conflicts: readonly { outcome: string }[]): string[] {
  const byOutcome = new Map<string, number>();
  for (const conflict of conflicts) {
    byOutcome.set(conflict.outcome, (byOutcome.get(conflict.outcome) ?? 0) + 1);
  }
  return [...byOutcome.entries()].map(([outcome, count]) =>
    (CONFLICT_COPY[outcome] ?? ((n: number) => `${n} membership(s) could not be restored.`))(count)
  );
}

async function cancellationStatus(op: string, receipt: string) {
  if (!UUID_RE.test(op) || !RECEIPT_RE.test(receipt)) return null;
  try {
    return await respinDb.readIdentityCancellationStatus(op, receipt);
  } catch (err) {
    rethrowNextControlFlow(err);
    // Expired, consumed or wrong: the deletion was still cancelled (the route
    // only redirects here after it was), so the plain line renders.
    return null;
  }
}

export default async function RecoverDeletionPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await props.searchParams;
  const op = typeof search.op === "string" ? search.op : "";
  const s = typeof search.s === "string" ? search.s : "";
  // VALIDATED, never reflected: `done` is a fixed token, and every number on
  // the success banner comes from the receipt read, not from the URL. The
  // receipt itself is the route's short-lived cookie (R-166), never a query
  // parameter — a `r=` in the URL is ignored.
  const done = search.done === "1";
  const receipt = done ? ((await cookies()).get(RECOVERY_RECEIPT_COOKIE)?.value ?? "") : "";
  const status = done ? await cancellationStatus(op, receipt) : null;
  const e = typeof search.e === "string" ? search.e : null;
  return (
    <section>
      <h1>Cancel account deletion</h1>
      {done ? (
        <div className="banner" role="status" data-testid="recover-ok">
          <strong>Deletion cancelled.</strong>
          {status ? (
            <>
              <p className="muted" data-testid="recover-restored">
                {status.restoredMembershipIds.length} membership(s) restored. Sign in again to continue — your previous sessions do not return.
              </p>
              {conflictLines(status.conflicts).map((line) => (
                <p className="muted" data-testid="recover-conflict" key={line}>
                  {line}
                </p>
              ))}
            </>
          ) : (
            <p className="muted">Sign in again to continue — your previous sessions do not return.</p>
          )}
          <p className="muted">
            A workspace that was scheduled for deletion with your account stays scheduled until you cancel it on /settings/account.
          </p>
        </div>
      ) : null}
      {e !== null ? (
        <div className="banner" role="alert" data-testid="recover-error">
          <strong>That link and password could not cancel the deletion.</strong>
          <p className="muted">The link is single-use and expires seven days after the request. If it has expired, the deletion proceeds.</p>
        </div>
      ) : null}
      {!done ? (
        <form action="/api/deletion/recover" method="post" data-testid="recover-form">
          <input type="hidden" name="op" value={op} />
          <input type="hidden" name="s" value={s} />
          <label>
            Your password
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <p className="muted">Possession of the link is not enough on its own: your password is required as a fresh factor.</p>
          <button className={buttonClass("primary")} type="submit" disabled={!op || !s}>
            Cancel my deletion
          </button>
        </form>
      ) : null}
    </section>
  );
}
