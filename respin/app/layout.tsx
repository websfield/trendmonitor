import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./respin-tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  // R-2: "Respin" is a working name; nothing user-facing hardcodes it elsewhere.
  title: "Respin",
  description: "Scripts in your voice, built on mechanisms that perform.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Dark is the default (:root); light activates via data-theme="light" on
  // <html>. No toggle UI yet — the attribute is the contract (DESIGN.md).
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
