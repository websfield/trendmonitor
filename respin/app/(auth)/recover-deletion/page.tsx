// /recover-deletion — the page the identity-deletion recovery email links to.
// Public by design: the reader has no session. Nothing here reads the
// database; the form carries the link's two values and asks for the password,
// and POST /api/deletion/recover does the rest.
import { buttonClass } from "../../ui/button";

export default async function RecoverDeletionPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await props.searchParams;
  const op = typeof search.op === "string" ? search.op : "";
  const s = typeof search.s === "string" ? search.s : "";
  const ok = typeof search.ok === "string" ? search.ok : null;
  const e = typeof search.e === "string" ? search.e : null;
  return (
    <section>
      <h1>Cancel account deletion</h1>
      {ok !== null ? (
        <div className="banner" role="status" data-testid="recover-ok">
          <strong>Deletion cancelled.</strong>
          <p className="muted">
            {ok === "0"
              ? "No memberships were restored. Sign in again to continue."
              : `${ok} membership(s) restored. Sign in again to continue — your previous sessions do not return.`}
          </p>
        </div>
      ) : null}
      {e !== null ? (
        <div className="banner" role="alert" data-testid="recover-error">
          <strong>That link and password could not cancel the deletion.</strong>
          <p className="muted">The link is single-use and expires seven days after the request. If it has expired, the deletion proceeds.</p>
        </div>
      ) : null}
      {ok === null ? (
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
