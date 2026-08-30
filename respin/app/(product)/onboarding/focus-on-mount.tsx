"use client";

// Move focus to the refusal when the page loads carrying one.
//
// WHY THIS EXISTS AT ALL. `role="alert"` announces a live region that CHANGES
// after load. A refused server action here comes back as a full-page redirect
// (`actions.ts` → `redirect(failHref(err))`), so the alert is present in the
// initial DOM — the one case a screen reader does not announce — and focus
// resets to the top of the document. The refusal was rendered, styled, and
// effectively invisible to anyone not looking at the top of the page.
//
// The previous test asserted that the `role="alert"` ATTRIBUTE existed, which
// is this repo's "a comment claiming a property is not the property" wearing a
// test's clothes (production gate, 2026-08-27).
//
// A CLIENT ISLAND, not a page-level "use client": the page stays a server
// component (it reads the database), and this ships a few lines of JS whose
// only job is the focus move. With JS off, the refusal is still rendered and
// still reachable by keyboard — `tabIndex={-1}` plus its heading — so this is
// an enhancement, not the mechanism.
import { useEffect } from "react";

export function FocusOnMount({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (el instanceof HTMLElement) el.focus();
  }, [targetId]);
  return null;
}
