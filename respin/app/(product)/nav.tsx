"use client";

// The shell nav. Client-only so the active item can be derived from the real
// pathname (`aria-current="page"` carries the state — never color alone).
// Plain <a> elements, same as the header this replaces: no framework Link
// enters at M1, and the hrefs are unchanged.
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/onboarding", label: "Onboarding" },
  { href: "/studio", label: "Studio" },
  { href: "/usage", label: "Usage" },
  { href: "/settings/billing", label: "Billing" },
] as const;

export function ProductNav() {
  const pathname = usePathname();
  return (
    <nav className="shell-nav" aria-label="Product">
      {ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <a
            key={item.href}
            href={item.href}
            className="nav-item"
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
