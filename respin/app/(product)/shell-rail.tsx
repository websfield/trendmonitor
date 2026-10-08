// The sidebar rail's identity block — PURE, so a test can drive the refusal
// render with a fixture (`tests/shell-rail.test.tsx`), the same rule every
// other view on this surface obeys.
//
// `credits: null` is the REFUSAL render: the layout maps every failed or
// refused balance read (multi-workspace WorkspaceAccessError, a ledger
// integrity failure) to null, and this component renders NOTHING for it —
// never a guess, never a stale number. The pages own the full refusal copy;
// the rail only ever shows a balance that `respinCredits.getDisplayBalance`
// actually derived for the caller's own verified workspace.
//
// `settling` (audit Phase 8, P8-R1) is NOT a refusal: another transaction held
// the workspace's billing lock when the balance was read, so the number is the
// committed fold — every row already committed, without anything the lock
// holder may be writing and without a monthly allowance not yet minted. It
// renders, and says it may change, so it is never shown as final. It claims
// no write is in progress: a held lock proves only that the lock is held.
export function ShellRail({
  workspaceName,
  credits,
  settling = false,
}: {
  workspaceName: string;
  /** The derived balance, or null when it could not be derived. */
  credits: number | null;
  /** True when `credits` is the committed fold rather than the settled balance. */
  settling?: boolean;
}) {
  return (
    <>
      <span className="shell-workspace">{workspaceName}</span>
      {credits !== null ? (
        <span
          className="shell-credits"
          data-testid="shell-credits"
          data-settling={settling ? "true" : undefined}
        >
          {credits} credits
          {settling ? " (may change)" : null}
        </span>
      ) : null}
    </>
  );
}
