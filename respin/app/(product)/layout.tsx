// Authenticated product shell. Middleware only does the optimistic cookie
// redirect — requireUser() HERE (and on every page below, per the
// gate-completeness test) is the real gate. First authenticated visit runs
// the lazy idempotent workspace bootstrap (R-16b).
import type { ReactNode } from "react";
import { requireUser } from "@respin/auth";
import { respinDb } from "@respin/db";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function ProductLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  const { workspace } = await respinDb.ensureUserWorkspace({
    authUserId: user.id,
    name: user.name || undefined,
  });

  return (
    <>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          padding: "0.75rem 1.5rem",
          borderBottom: "1px solid #ddd",
        }}
      >
        <strong>{workspace.name}</strong>
        {/* The three M1 pages were reachable only by typed URL — the evidence
            runbook said "from /settings/billing" without saying how one gets
            there (round-2 NOTE 6). Plain links in the existing inline style;
            no framework enters at M1. */}
        <nav style={{ display: "flex", gap: "1rem", fontSize: "0.9rem" }}>
          <a href="/studio">Studio</a>
          <a href="/usage">Usage</a>
          <a href="/settings/billing">Billing</a>
        </nav>
        <SignOutButton />
      </header>
      <main style={{ padding: "1.5rem" }}>{children}</main>
    </>
  );
}
