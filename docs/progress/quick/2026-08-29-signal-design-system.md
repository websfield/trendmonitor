# Report card — Signal design system across the M1 surfaces

**Date:** 2026-08-29 · **Lane:** single-driver build via `/go` (design loop pre-done: `docs/design/` mockups + DESIGN.md were the locked pick) · **Branch:** `respin-m1-billing-credits` (uncommitted, alongside the owner's in-flight slice-3 work) · **Checkpoint:** git stash entry `claude-jig checkpoint: signal-design`

## Overall: Ready

The Signal system (dark-first graphite + one cobalt accent, Geist/Geist Mono, tokenized end to end) is implemented across every M1 surface named in the brief — product shell with sidebar + credits rail, auth, onboarding, usage, billing, studio shell, and the rebuilt landing — with zero behavior, copy, route, testid, or aria change beyond the additions the brief itself ordered. All gates pass.

## What got built

- `respin/DESIGN.md` + `respin/app/respin-tokens.css` copied in as source of truth; three implementation tokens added and recorded in DESIGN.md (`--sidebar-bg`, `--blueprint-line`, `--on-accent-body`).
- `respin/app/globals.css` — base + component classes, all values token-resolving; reduced-motion gate; light theme via `data-theme="light"` (verified in-browser); responsive collapse at 720/560px down to 360px.
- Fonts: `geist` package (new dependency), wired via `next/font` variables in `respin/app/layout.tsx`.
- Primitives `respin/app/ui/`: Button/`buttonClass` (single source of the class string, consumed everywhere), Panel, Banner (the no-red refusal component), Field, LedgerTable, Badge, Meter.
- Product shell: 224px rail, wordmark, client nav with `aria-current` active tick (`nav.tsx`), workspace + derived credits pinned at bottom (`shell-rail.tsx`, pure + tested), quiet sign-out.
- Landing rebuilt per mockup: stripe, blueprint hero, marquee, before/after demo with THE TURN, numbered steps, refuses panel, pricing grid with hover-lift.
- Refusals across error.tsx / access-refusal / onboarding / run-outcome moved from alarm-red to the neutral Banner.
- New tests: `tests/landing-pricing.test.ts` (10 tests — landing figures pinned to `CONFIG_V1_SEED` + REQ-G01, "priority" banned, marquee digits banned with planted-violation proof), `tests/shell-rail.test.tsx` (7 tests — refusal render + tempered source pin with three mutant non-vacuity cases).

## Gates

| Gate | Result |
| --- | --- |
| Entry: typecheck + lint | PASS (0 errors, ran on every edit via the post-edit hook) |
| Entry: test (plain) | PASS — 1124 passed / 0 failed / 31 loud-skipped (final run, `scratchpad/vitest-final2.log`) |
| Entry: test (CI shape, Docker live) | PASS — 1139/1139, money invariants under real concurrency (pre-fix-round run; the fix round touched no `packages/**` code) |
| Entry: `next build` | PASS — compiled clean, all routes |
| respin-billing-reviewer (full gates) | Round 0 **BLOCK** → round 1 **PASS** (grade A) |
| respin-tenancy-reviewer (full gates) | Round 0 NEEDS CHANGES → round 1 NEEDS CHANGES → round 2 **PASS** (grade A) |
| Lean merged code review (no-path surfaces) | Round 0 BLOCK (same landing defect) → round 1 NEEDS CHANGES, residual fixed without re-review → **PASS** |
| Definition of Done | PASS — entry gate clean, all touched Critical-Path gates PASS, reachability: every change is on a live user path (`/`, `/sign-in`, `/sign-up`, `/onboarding`, `/studio`, `/usage`, `/settings/billing`), docs (DESIGN.md) updated |

**Reviewer spend:** 7 reviewer runs total — 3 initial (announced), 3 round-1 re-runs, 1 round-2 re-run. Gate intensity: lean (billing + tenancy escalated to their own reviewers per the `Full gates?` column).

## What the gates caught (the reason they exist)

1. **BLOCK (billing + lean, independently):** the mockup's landing pricing sold entitlements the shipped config refuses — Pro "1,800 credits / 3 profiles" vs the real 2,000/1, Studio "7,000 / 10" vs 8,000/5, plus a nonexistent "priority generation queue". Fixed to the `CONFIG_V1_SEED`/PRD §4G numbers and pinned by `tests/landing-pricing.test.ts` so the next mockup import cannot drift them silently.
2. **Invented metrics stripped:** the mockup's marquee carried fake performance figures ("2.4x watch-through") on the page that says "It never fakes a number". Tags are now qualitative, digit-banned by test. *Deliberate deviation from the mockup*, per non-negotiable 6 / REQ-I03.
3. **Tenancy:** the sidebar credits read is scoped through `withWorkspace` → branded `VerifiedWorkspaceId` → `getBalance` (single authority); the refusal-renders-nothing property is now a tested property, not a comment, with a tempered source pin proven against five planted mutants.
4. **Dark-flip stragglers:** the global dark background had broken contrast on the un-restyled admin config surface and one onboarding fallback (`#555` on dark, pink warn panel). Retargeted to tokens.

## Least-confident probe

Declared: *the product layout's new guarded balance read — the one place the restyle touched data flow.* It held on substance (all three reviewers confirmed the scoping and refusal path sound) but its **documentation** broke exactly there: the refusal claim lived in an untested comment (tenancy round-0 CHANGE) and the catch swallowed integrity errors silently (fixed with `logRefusal`). The declaration pointed the reviewers at the right place.

## Fixed without re-review (Medium and below, batched)

- `logRefusal` added to the shell's balance catch (billing/tenancy NOTEs).
- Admin config + onboarding `#555`/pink literals → tokens (lean CHANGE-2).
- Two hand-assembled `"btn btn-*"` strings (error.tsx, sign-out-button.tsx) → `buttonClass` (lean round-1 CHANGE, cosmetic class).
- `:focus-visible` transparent outline for forced-colors mode; visually-hidden "How it works" h2; error.tsx redundant inline sizes; Meter `max<=0` guard; `??=` widening of the shell-rail pin (tenancy round-2 NOTE).

## Accepted / recorded, not changed

- **Badge and Meter primitives have no consumer yet** — built because the brief explicitly ordered the full component inventory; their consumers (Trends badges, Results meters) arrive in later milestones. Recorded as accepted inventory.
- Landing fine print "Unused monthly credits expire" slightly under-states REQ-G02's one-month rollover (billing NOTE — true, safe under-claim; better marketing copy available if wanted).
- `package.json`'s `dev -p 8000` port pin is in the uncommitted tree from before this session's work; unattributable via git because the whole tree is uncommitted.
- The known `/usage` + `/settings/billing` bootstrap-vs-scope race (`workspace-scope.ts`) is pre-existing and untouched, as that file records.

## Visual verification (design loop, eyes not prose)

Walked in a real browser at 1440px and 360px, dark and light (`data-theme="light"` attribute): `/` (full landing incl. marquee + pricing), `/sign-in`, `/sign-up` → `/onboarding` steps 1–2 (live form submissions), `/studio`, `/usage`, `/settings/billing` (incl. the styled auto-top-up toggle). Two critique rounds; round two produced no new fixes. Screenshots at repo root (`landing-1440.png`, `usage-1440.png`, `billing-toggle-1440.png`, `onboarding-step2-1440.png`, `landing-360.png`, `usage-light-1440.png`, …).
