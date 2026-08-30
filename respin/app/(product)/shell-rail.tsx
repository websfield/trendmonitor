// The sidebar rail's identity block — PURE, so a test can drive the refusal
// render with a fixture (`tests/shell-rail.test.tsx`), the same rule every
// other view on this surface obeys.
//
// `credits: null` is the REFUSAL render: the layout maps every failed or
// refused balance read (multi-workspace WorkspaceAccessError, a ledger
// integrity failure) to null, and this component renders NOTHING for it —
// never a guess, never a stale number. The pages own the full refusal copy;
// the rail only ever shows a balance that `respinCredits.getBalance` actually
// derived for the caller's own verified workspace.
export function ShellRail({
  workspaceName,
  credits,
}: {
  workspaceName: string;
  /** The derived balance, or null when it could not be derived. */
  credits: number | null;
}) {
  return (
    <>
      <span className="shell-workspace">{workspaceName}</span>
      {credits !== null ? (
        <span className="shell-credits" data-testid="shell-credits">
          {credits} credits
        </span>
      ) : null}
    </>
  );
}
