# Shaping brief — respin-auth-swap

**Request (as stated):** Owner: no Neon/Clerk/Vercel — Lightsail + Postgres (R-18); Better Auth chosen as Clerk's replacement (R-19, AskUserQuestion 2026-08-14).
**Real job:** A creator can sign up and reach their workspace with zero third-party auth dependency — and the M0 auth evidence run becomes provable locally (email/password needs no external account).
**Chosen scope:** Replace Clerk with Better Auth across the M0 surface, at parity: email/password now, Google when the owner adds OAuth credentials; sessions + auth tables in our own Postgres via the Drizzle adapter; identity columns provider-neutral (`auth_user_id`).
**North Star alignment:** unblocks the Current-focus M0 evidence criteria under the new stack; nothing else changes.
**Non-goals (now):** organizations/seats (M6 — Better Auth's org plugin is the planned vehicle, R-19); password reset email delivery (needs an email provider — stub logs the link, honest TODO); any M1 feature.
**How this fails (pre-mortem):**
1. **The middleware gate quietly weakens** — Better Auth cannot fully verify sessions in edge middleware (cookie check is optimistic). If the real gate doesn't demonstrably move to the server layer (layout + per-page `requireAdmin`), the admin surface is open. Must-answer: the plan names the new gate location and tests it fail-closed.
2. **Two sources of identity truth** — Better Auth's `user` table vs the domain `users` table. Mitigation: domain keeps its own row keyed by unique `auth_user_id` (provider-neutral, bootstrap conflict-branch structure preserved); the auth tables are adapter-owned and never queried by domain code.
3. **Client-nav bypass of layout checks** — App Router does not re-render a cached layout on client-side navigation, so a layout-only admin check can be skipped. Mitigation: `requireAdmin()` called in the layout AND every admin page; pattern recorded for M6.
