// The authenticated shell's MARKUP — pure, so the production layout and the
// browser fixture render the SAME component instead of two hand-matched copies.
//
// WHY THIS EXISTS: the v2 fixture hand-rewrote this markup while the harness
// header claimed it "runs the current production UI", and the phase-1 design
// score was awarded to that replica. Nothing asserted the two agreed beyond
// three `toContain` string checks, so the replica could drift from production
// silently and the captures would still be presented as evidence of the real
// shell — Golden rule 6's "a run pointed at a copy instead of the real target".
// Extracting the markup makes drift impossible rather than merely detectable:
// there is one definition, and the fixture imports it.
//
// It stays PURE (no async, no gate, no query) for the same reason `ShellRail`
// is: every authority — `requireUser()`, `ensureUserWorkspace`,
// `withWorkspace`, `getDisplayBalance` and the refusal mapping — remains in
// `layout.tsx`, above this component. This renders what it is handed.
import type { ReactNode } from "react";
import { SignOutButton } from "./sign-out-button";
import { ProductNav } from "./nav";
import { ShellRail } from "./shell-rail";
import { Brand } from "../ui/icons";
import { ThemeSwitch } from "../ui/theme-switch";

export function ProductShell({
  workspaceName,
  credits,
  creditsSettling = false,
  children,
}: {
  workspaceName: string;
  /** `null` is the refusal render: no credits element, never a guessed zero. */
  credits: number | null;
  /** The number is the committed fold, still updating (audit Phase 8, P8-R1). */
  creditsSettling?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="shell-sidebar">
        <a className="shell-wordmark" href="/studio" aria-label="Respin Studio"><Brand /></a>
        {/* The three M1 pages were reachable only by typed URL — the evidence
            runbook said "from /settings/billing" without saying how one gets
            there (round-2 NOTE 6). Same links, now the Colour Pop / After Hours rail (R-129). */}
        <ProductNav>
          <div className="shell-foot">
            <ShellRail workspaceName={workspaceName} credits={credits} settling={creditsSettling} />
            <ThemeSwitch />
            <SignOutButton />
          </div>
        </ProductNav>
      </aside>
      <main id="main-content" className="shell-main" tabIndex={-1}>{children}</main>
    </div>
  );
}
