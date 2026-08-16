import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      {children}
    </main>
  );
}
