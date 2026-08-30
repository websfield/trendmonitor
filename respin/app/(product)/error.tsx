"use client";

// The product shell's error boundary.
//
// WHAT IT REPLACES. Before this file, a transient database failure on a read
// that was not individually wrapped dead-ended on Next's default screen —
// "Application error: a client-side exception has occurred… Digest: 1234567890"
// — with no remedy, no navigation and no branding, on a surface whose siblings
// all render a carefully worded named refusal (production gate, 2026-08-27).
// Every page in this group reads a database on every render, so "no page ever
// throws" was never a property any of them had.
//
// IT IS THE FLOOR, NOT THE PLAN. A refusal a page can NAME still belongs in
// that page's own try/catch with its own copy, because this boundary knows only
// that something failed. What it guarantees is that the worst case is a page
// that says so and offers a way forward, rather than a stack-trace digest.
//
// NO ERROR DETAIL IS RENDERED, deliberately: Next hands the boundary the real
// error in development and a digest in production, and a message here is a
// message on a screen a creator reads. The detail belongs in the server log,
// through `safe-log.ts`, which is where it already goes.
import { useEffect } from "react";
import { buttonClass } from "../ui/button";

export default function ProductError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only thing that correlates this screen to a server log
    // line. It carries no user content — it is a hash Next generates.
    console.error("[product] render failed", { digest: error.digest });
  }, [error]);

  return (
    <section>
      <h1>Something went wrong on our side</h1>
      <div className="banner" role="alert">
        <strong>This page could not be loaded.</strong>
        <p className="muted">
          Nothing you have saved was changed or lost. This is usually
          temporary — try again, and if it keeps happening the reference below
          is what an operator needs to find it in the logs.
        </p>
        {error.digest ? (
          <p className="muted">
            Reference: <code>{error.digest}</code>
          </p>
        ) : null}
        <p>
          <button type="button" className={buttonClass("primary")} onClick={reset}>
            Try again
          </button>{" "}
          <a href="/onboarding">Back to onboarding</a>
        </p>
      </div>
    </section>
  );
}
