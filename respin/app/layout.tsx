import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  // R-2: "Respin" is a working name; nothing user-facing hardcodes it elsewhere.
  title: "Respin",
  description: "Scripts in your voice, built on mechanisms that perform.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
