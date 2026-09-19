# Phase 1 — live onboarding completion evidence (Verification 3)

**Date:** 2026-09-18
**Method:** Playwright MCP browser driven manually against the configured local environment (`next dev -p 8000`, worker PID 64840, `respin-postgres` on 5435). Real Anthropic calls; real credit spend.
**Result:** the completed-onboarding header reads **4 of 4 done**, with all four steps `done`. This closes the item the Phase 1 review recorded as outstanding ("live Verification 3's completed onboarding header 4/4 remains unverified; prior screenshot shows 0/4").

**Screenshot:** `phase-1-onboarding-header-4of4.png` (viewport, `/onboarding`).

## Environment repair performed first

The dev server already running on port 8000 returned HTTP 500 on every rendered route:

```
Error: Cannot find module './196.js'
Require stack: C:\projects\ai.playground\trendMonitor\respin\.next\server\webpack-runtime.js
```

This was a stale/corrupt Next build cache, not a product defect. With the owner's approval the dev server process (PID 34584) was stopped, `respin/.next` was deleted, and the server was restarted. The worker process was left running and untouched. No product code, migration, or database schema was changed at any point in this run.

## What was driven, in order

New account `riley-p1-evidence-20260918@example.com`, new workspace, Free plan, starting balance 25 credits.

| # | Step | Action | Observed result |
|---|---|---|---|
| 0 | Sign-up | Created account | Landed on `/onboarding`; checklist rendered **0 of 4 done** (`Own posts: next`) |
| 1 | Own posts | Created profile "Riley Evidence Creator", saved 4 own posts (minimum is `minOwnPostsForVoice: 3`) | "Your posts (4)"; checklist **1 of 4 done**, `Own posts: done`, `Voice: next` |
| 2 | Voice | Pressed "Build my voice brain" | Run succeeded. 11 rules drafted, **a quote found behind every one**. Included first run, nothing spent, balance still 25. |
| 2b | Voice activation | `/brain`: confirmed all 11 rules, recorded decisions, activated | `voice-active-meta` reads "Version 1, activated on 2026-09-18". Checklist `Voice: done`. |
| 3 | Interview | `/onboarding/interview`: filled audience, positioning, goals, ambitions, north-star metric (Saves / saves per post), banned words and vibes; saved, reviewed, submitted | Checklist **3 of 4 done**, `Interview: done`, `First ideas: next` |
| 4 | First ideas | `/onboarding/first-ideas`: TikTok, brief "A short series on the boring parts of editing nobody shows." | 5 ideas returned (model returned 5 rather than 3; the page states this and withholds none). Cost 3 credits, balance 22. |
| 5 | Header capture | Returned to `/onboarding` | **4 of 4 done** — `Own posts: done`, `Voice: done`, `Interview: done`, `First ideas: done` |

Exact captured header text:

```
H1: Set up your creator profile
CHECKLIST: 4 of 4 done  Own posts: done  Voice: done  Interview: done  First ideas: done
```

## Why the earlier journey captured 0/4

`respin/e2e/journeys/solo-creator.spec.ts` captures `onboarding-profile-created` immediately after creating the profile, and never navigates back to `/onboarding` after the first-ideas chapter. The 0/4 screenshot was therefore correct for the moment it was taken; the journey simply has no step that could ever show 4/4. Producing this evidence required driving the flow to the end and revisiting `/onboarding` — which is what was done here.

## `bad_shape` — not reproduced, and diagnosed as structurally unloggable

The voice build **succeeded** on this run, so `bad_shape` was not reproduced. Across recorded in-app runs the live sample is now **1 refusal in 3** (the prior pass's 1-in-2, plus this success). One observation does not resolve the finding, and nothing here should be read as a fix.

What did change is that the reason the offending schema field is unknown is now established, by reading the code rather than by guessing:

1. `parseVoiceReply` (`respin/packages/llm/src/assemble.ts:473-480`) raises `bad_shape` when `replySchema.safeParse` fails, and it **does** compute the failing location — the thrown `AssemblyError` message embeds the first Zod issue's path, e.g. `/fields/0/values …`.
2. That message never reaches any log. `logRefusal` (`respin/app/(product)/safe-log.ts:160-168`) logs only what `safeLogFields` returns, and `safeLogFields` (`:76-104`) returns exactly `{ code, errorName, driverCode? }` — the error's message is deliberately withheld as a content-safety containment boundary.
3. `respin/app/(product)/onboarding/actions.ts:323-333` adds `assemblyKind` to the log context, which is why the evidence shows `assemblyKind: 'bad_shape'` and nothing more.

So the failing field is not missing from the evidence by accident or by a lost capture — it is discarded by design on every occurrence. No amount of re-running the journey will surface it.

**Candidate causes, from the schema itself** (`assemble.ts:175-188`) — every level is `z.strictObject`, so the most likely real cause is an **unrecognized key the model added** (a `reasoning`, `confidence`, `note` or `offsets` field), with these also possible: `fields` absent or empty (`.min(1)`), a `value` that is an empty string, or `inputId`/`quote` omitted rather than sent as `null`.

**Not done here, and deliberately:** no parser or logging change was made. Recording the Zod issue *path* (not the message) as a server-derived log field would make the next occurrence diagnosable in one line, and the path is content-free — but that is a product change on the onboarding/compliance surface and needs the owner's direction and the applicable Critical-Path gates, not a drive-by edit during evidence gathering.

## Scope and limits

- This is one live run on one new workspace. It establishes that 4/4 is reachable live; it is not a statistical claim about reliability.
- Real vendor calls were made and 3 credits were spent. The voice build was the included first run.
- No test was run, added, or changed in this session. No assertion was touched.
- The `[check]` placeholder convention was observed working in the first-ideas output (unknown specifics rendered as `[check]`, with a stated weakest point), consistent with REQ-I03.
