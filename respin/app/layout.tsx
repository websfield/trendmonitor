import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { themeBootstrap } from "./ui/theme";
import "./respin-tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  // R-2: "Respin" is a working name; nothing user-facing hardcodes it elsewhere.
  title: "Respin",
  description: "Scripts in your voice, built on reviewed mechanisms.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body>{children}</body>
    </html>
  );
}
