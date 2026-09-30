"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "../ui/icons";

const PRIMARY = [
  { href: "/studio", label: "Studio", icon: "studio" },
  { href: "/trends", label: "References", icon: "references" },
  { href: "/brain", label: "Brain", icon: "brain" },
  { href: "/results", label: "Results", icon: "results" },
] as const;
const SECONDARY = [
  { href: "/onboarding", label: "Onboarding", icon: "onboarding" },
  { href: "/usage", label: "Usage", icon: "usage" },
  { href: "/settings/billing", label: "Billing", icon: "billing" },
  { href: "/settings/account", label: "Account", icon: "account" },
] as const;

export function ProductNav({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  function links(items: readonly (typeof PRIMARY[number] | typeof SECONDARY[number])[]) {
    return items.map((item) => <a key={item.href} href={item.href} className="nav-item"
      aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "page" : undefined}>
      <Icon name={item.icon} /><span className="nav-label">{item.label}</span>
    </a>);
  }
  // ONE copy of the secondary links and of `children` (workspace name, derived
  // balance, appearance control, sign out). The first cut rendered both twice —
  // once for the desktop rail, once inside the mobile disclosure — and let a
  // media query pick which copy was visible. All three phase-1 reviewers found
  // it: `data-testid="shell-credits"` was duplicated in production markup, two
  // SignOutButton instances mounted per page, and two guards had to be relaxed
  // to tolerate it (the page-wiring href assertion became a Set, the browser
  // checks became `:visible`). It also put nav-item availability in a
  // stylesheet, which is the wrong home for REQ-A02's role filter later.
  //
  // `<details>` holds only the summary; the drawer is its SIBLING, revealed by
  // `.shell-nav-more[open] ~ .shell-nav-drawer`. Verified in Chromium 3-engine
  // run: closed hides the panel, click and Enter both toggle, and it needs no
  // JavaScript. Putting the drawer INSIDE the details cannot work, because
  // desktop would then have to force a closed details open — neither
  // `display: contents` on the details nor a `display` override on the child
  // reveals closed content in any of Chromium, Firefox or WebKit (measured).
  // Trade, recorded for the manual screen-reader pass: the summary's implicit
  // expanded state now refers to an empty details, so `aria-controls` names the
  // drawer it actually governs.
  return <nav className="shell-nav" aria-label="Product">
    <details className="shell-nav-more">
      <summary aria-controls="shell-nav-drawer"><Icon name="menu" />More</summary>
    </details>
    <div className="shell-nav-primary">{links(PRIMARY)}</div>
    <div className="shell-nav-drawer" id="shell-nav-drawer">
      <div className="shell-nav-secondary">{links(SECONDARY)}</div>
      {children}
    </div>
  </nav>;
}
