// The admin gate: requireAdmin() — fail closed (empty/unset ADMIN_USER_IDS
// denies everyone). Repeated on every admin page because client-side
// navigation caches layouts (gate-completeness test enforces this).
import type { ReactNode } from "react";
import { requireAdmin } from "@respin/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin();
  return <main style={{ padding: "1.5rem" }}>{children}</main>;
}
