# PRD: Respin - Creator Content Engine

**Working title:** Respin (placeholder - run domain research before launch)
**Status:** v1, implementation-ready
**Date:** 13 August 2026
**Supersedes:** `docs/video-editing/PRD.md` (Cutdown v2) as the active product direction. Cutdown's render pipeline is parked as a possible future execution layer; its PRD is demoted to a component spec. Record this as a superseding entry in the old decisions.md - do not delete or edit the old PRD in place.

**Product thesis:** A subscription web service that turns a creator's idea, reference reel, or day of footage into a script in their own voice, mapped to shots they can actually film, built on a mechanism extracted from posts that are proven to perform - and that gets measurably better for each creator as their posted results feed back in.

**Product-language decision (carried over from Cutdown, unchanged):** The product performs policy-compliant distribution optimisation. It never promises virality, never fabricates engagement, and never produces verbatim copies of other creators' content. The trend feature's verb is **Spin**: extract the mechanism, replace the surface. This is simultaneously the compliance position and the performance position - the evidence base behind this product shows adapted mechanisms outperform copies.

---

## 1. Problem and Opportunity

Creative fatigue, not editing workload, is the top driver of creator burnout (40% vs 31% in the 2025 Billion Dollar Boy research), and 40-50% of new creators stop posting within six months. The nightly ritual is well documented: scroll competitors, screenshot hooks, replay transitions, end with a spreadsheet and no answers. Meanwhile 85% of creators say they would use an AI agent that learns their creative style (Adobe Creators' Toolkit, 16,000 creators), but current AI usage is shallow - generic chat for brainstorming and drafts - and audiences are punishing generic AI output (enthusiasm for AI-flavoured creator content fell 60% to 26% between 2023 and 2025).

The gap: no product holds a creator's voice, strategy, and tested performance history in one place and uses all three to turn an input (idea, trend, footage) into a filmable script that could not have been written for anyone else. Script generators are commodities. A per-creator brain with an evidence loop is not.

This product has already been proven at n=1. The `vivian-content` skill (voice rules, framework library extracted from viral-corpus autopsies, performance log with follows-per-1k as north star) produced one creator's best-converting post to date (5.00 follows/1k against a 1.3-1.5 baseline) and, more importantly, a repeatable method: autopsy references → extract mechanisms as named frameworks → generate through the creator's voice → log results with confounders → promote rules only on evidence. This PRD generalises that method into a multi-tenant SaaS.

Cost of inaction: the method stays a hand-run consultancy for one creator, and the compounding assets (framework library, per-creator brains) never accrue.

## 2. Users and Jobs to Be Done

**Primary - the solo short-form creator.** 1k-500k followers, posts 3-7 times a week on TikTok/Reels/Shorts, films and edits on their phone, no team. **Launch wedge (R-11): YouTube Shorts creators first** - trend data is available and compliant there on day one, incumbents (Spotter, vidIQ, 1of10) have proven willingness to pay for ideation on that platform, and none of them outputs a filmable script in the creator's voice. TikTok/IG-native creators are the expansion segment, entered via licensed data once pilot demand names the platform. When they open the app with an idea, a trending reel, or a camera roll of clips, they want to leave 10 minutes later with a script in their voice, hooks to test, and a shot list - not a chat transcript. Emotional job: stop dreading the blank page; stop feeling like their output could have been posted by anyone.

**Secondary - the creator-operator (Studio tier).** A creator with a VA/editor, or a micro-agency running 2-5 creator accounts. Needs separate creator brains per account, seats, and no leakage of voice or performance data between profiles.

**Internal - the curator.** Maintains the shared framework library: approves new frameworks proposed from autopsies, marks saturation, retires stale entries. Day one this is the founder; the admin surface must exist from the start because the library is the compounding asset.

Explicitly not served in v1: brands buying UGC, agencies managing client approval workflows, long-form YouTube.

## 3. Solution Overview

Respin is a web app with four connected surfaces on top of a three-layer intelligence architecture.

**The three layers (the core IP):**

1. **Universal laws** - a small set of evidence-backed rules applied to every generation: identity converts followers while advice buys views; reach and conversion are separate levers and every output names which it pulls; open threads beat resolved endings; and the anti-AI-slop voice rules (no fragment triads, no antithesis constructions, no invented personal details - placeholders marked `[check]` instead). These rules exist because they measurably separate output from generic AI content.
2. **The shared framework library** - named mechanisms (Confession Arc, Self-Inventory, Borrowed Concept, Quest Pilot...) extracted from autopsies of high-performing posts. Each framework is a versioned record: beats, why it converts, evidence, confidence, tested caveats, saturation status. Grown continuously by the trend monitor and by creator-run autopsies; curated by a human before anything becomes recommendable. This is Cutdown's REQ-035 contextual rule engine and REQ-070-077 trend schema, repurposed.
3. **The per-creator brain** - four versioned documents per creator profile: VoiceProfile (register, banned words, learned from feedback), StrategyProfile (positioning line, declared goals, content pillars, how goals bias hook/framework choice), PerformanceLog (declared north-star metric, results with confounders, promotion rules), and a personal KillTest (universal checks plus rules learned from this creator's own rejections and results).

**The four surfaces:**

1. **Studio** - the generation workspace. Seven modes (see REQ-030s), each producing a structured output: thesis, framework, 3-5 hooks with mechanic labels, timestamped VO script with the turn marked, shot map, on-screen text plan, caption, and an honest "why this performs" including the concept's weakest point.
2. **Trends** - the monitor. A feed of outperforming posts in the creator's tracked niches, each already autopsied (hook mechanic, structure, ending, follow trigger). One button: **Spin** - generate my version through my brain. Original shown alongside for reference.
3. **Results** - the performance log. Creator reports numbers per posted script (or connects analytics later); the system computes their normalised metric, names confounders, and proposes rule promotions the creator approves or rejects. Never silent.
4. **Marketing site + billing** - public site, pricing page, checkout, account/usage management.

Why this approach over alternatives: a pure chat interface (rejected - loses the structured output and the brain), a video generator (rejected - audience backlash, commodity), a clip-repurposer (rejected - crowded, Opus/Descript own it), an analytics dashboard (rejected - tells creators what happened, not what to make).

## 4. Functional Requirements

Requirements are numbered for traceability. Families reuse Cutdown numbering where the requirement survives conceptually, so the old PRD remains a valid reference for rationale.

### A. Accounts, Workspaces, and Profiles

**REQ-A01 [Must]:** Users sign up with email or Google, land in a personal workspace, and can create one creator profile on Free, one on Creator, one on Pro, and up to five on Studio.
**REQ-A02 [Must]:** Studio workspaces support up to 3 seats with roles: owner (billing + all), editor (generate + log results), viewer.
**REQ-A03 [Must]:** Creator profiles are strictly isolated: no voice, strategy, performance, or generation data crosses profiles or workspaces. Shared-library contributions are mechanism-level only and stripped of personal specifics (see REQ-D04).
**REQ-A04 [Must]:** A creator can export their full brain (all four documents plus generation history) as JSON/markdown at any time, and delete their account with full data removal within 30 days.

### B. Onboarding - Building the Brain

**REQ-B01 [Must]:** A guided onboarding builds a draft brain in under 20 minutes from three inputs: a structured interview (goals, positioning, north-star metric, banned words/vibes, ambitions they will say out loud), links or pasted text of 5-10 of their own past posts, and optionally 2-3 reference posts they admire. (Carried from Cutdown REQ-062.)
**REQ-B02 [Must]:** Every inferred brain field shows its source evidence and a confidence level, and the creator confirms or edits each before the brain activates. The system never silently infers sensitive personal traits. (REQ-061/063 carried.)
**REQ-B03 [Must]:** The creator declares their north-star metric at onboarding (follows/1k reach, saves/1k, link clicks, watch-through, sales) and can change it later; every subsequent output and result is judged against the declared metric, not a generic engagement score. (REQ-123 carried.)
**REQ-B04 [Should]:** Onboarding ends by generating the creator's first three ideas through their new brain, so the aha moment happens inside the first session.

### C. The Studio - Generation Modes

**REQ-C01 [Must]:** Seven modes, mirroring the proven skill: (1) Footage-to-thesis - creator lists what today's clips can prove, system proposes 3-4 theses and builds the chosen one; (2) Idea-to-script; (3) Source-to-reel - paste an article/newsletter/video transcript, system extracts insights and rebuilds them through the creator's stakes, never summarising the source; (4) Analyse-and-spin - autopsy any reference, then adapt; (5) Hooks only - 3-5 hooks across different mechanics, never five variants of one; (6) Caption; (7) Ideation - ideas delivered as hook + thesis + framework, never as topics.
**REQ-C02 [Must]:** Script outputs use the standard structure: thesis, framework + why it fits, hooks to test with mechanic labels, timestamped VO at ~150wpm with THE TURN marked, shot map (each beat mapped to a clip the creator has or a shot to film, literal-match priority), on-screen text plan, caption, and "why this performs" including the weakest point.
**REQ-C03 [Must]:** Every output passes the creator's KillTest before display. If all candidates die, the system says so and digs for a sharper angle rather than padding with filler. (Cutdown REQ-036's refusal principle.)
**REQ-C04 [Must]:** Hook sets deliberately span different mechanics; requested variants must differ in creative thesis, not clip order or wording. (REQ-031/032 carried.)
**REQ-C05 [Must]:** Feedback on any output ("too cringe", "more me", edits to the script) is captured as a structured event and proposed as a durable VoiceProfile or KillTest rule when it repeats. Proposals require approval; nothing updates silently. (REQ-065 carried.)
**REQ-C06 [Must]:** Generations are versioned and revisable: a revision note produces a new output linked to its parent without repeating unchanged work. (REQ-039/113 carried.)
**REQ-C07 [Should]:** Series planner: when an idea supports repetition, the system proposes the series architecture (numbered episodes, quest, countdown) as a first-class object with a planned arc.
**REQ-C08 [Could]:** Anti-homogenisation: track the creator's own recent hooks and structures and warn when output repeats them. (REQ-067 carried.)

### D. Shared Framework Library

**REQ-D01 [Must]:** Frameworks are versioned records: name, beats, why it converts, source references, evidence entries, confidence, tested caveats, saturation status (observed/emerging/established/saturated/retired), and applicability (niche, goal type). (REQ-035 + REQ-070/076 carried.)
**REQ-D02 [Must]:** A named curator approves any framework before it becomes recommendable; saturated frameworks warn and demand a fresh interpretation; retired ones are not recommended. (REQ-071/073 carried.)
**REQ-D03 [Must]:** Any autopsy (Mode 4 or trend-monitor) that finds a mechanism not matching an existing framework can propose a new one into the curation queue.
**REQ-D04 [Must]:** Library contributions derived from a creator's session carry mechanism-level content only - never the creator's personal details, voice rules, numbers, or performance data.
**REQ-D05 [Should]:** Pro+ creators can maintain private frameworks visible only to their profile.

### E. Trend Monitor and Spin

**REQ-E01 [Must]:** The system ingests candidate posts from compliant sources only: platform APIs and official trend surfaces where terms permit, licensed data providers, and creator-submitted links/transcripts. No scraping of closed platforms, no downloading media in breach of terms. (Cutdown's non-goal, kept hard.)
**REQ-E02 [Must]:** Outlier scoring: a post is trending for our purposes when it outperforms its own channel's baseline (outlier ratio), not merely when it has high absolute views. Score, channel baseline, and data window are stored per item.
**REQ-E03 [Must]:** Each surfaced trend item is autopsied automatically: hook mechanic, structure/beats, ending style, follow/share trigger, matched framework (or new-framework proposal). Autopsies are cached; one autopsy serves all users.
**REQ-E04 [Must]:** **Spin**: one action generates the creator's version through their brain. A spin must change, at minimum, the subject matter, the hook wording, and one structural element; the system displays original and spin side by side and never outputs a verbatim or near-verbatim reproduction (similarity check before display).
**REQ-E05 [Must]:** Tracked niches per tier (Free: digest only; Creator: 1; Pro: 3; Studio: 10). Each niche produces a refreshed feed at least daily and a weekly email digest.
**REQ-E06 [Must]:** Every trend item shows recency and saturation; items past their window are marked stale rather than deleted. (REQ-073 carried.)
**REQ-E07 [Should]:** Creators can submit any link into their feed; submitted items go through the same autopsy pipeline and can be spun.
**REQ-E08 [Won't v1]:** Auto-posting, engagement automation, or any interaction with the creator's platform account beyond reading analytics they authorise later.

### F. Results and Learning

**REQ-F01 [Must]:** A creator logs a result against a generated script: platform, post date, views, and the numerator of their north-star metric (follows/saves/clicks...). The system computes the normalised metric and compares against the creator's own baseline. Paid and organic are never pooled. (REQ-120/121/122 carried.)
**REQ-F02 [Must]:** Every result entry records confounders (topic overlap, posting-time unknown, account growth, spillover) as structured flags, and the UI never accepts a ranking claim without numbers - unverified reports are stored as unverified. (The E5 lesson, made structural.)
**REQ-F03 [Must]:** Learning is proposal-based: when results support a rule (framework X converts for you, hook mechanic Y underperforms), the system proposes a brain update showing sample size, effect, and confidence. Below minimum n (default 3 comparable results), findings display as exploratory and no rule is proposed. (REQ-125/126/127 carried; minimum-n discipline from the cutdown measurement program.)
**REQ-F04 [Must]:** Reach and conversion are reported as separate levers on every result; the product never collapses them into one score.
**REQ-F05 [Should]:** Optional analytics connectors (platform OAuth where APIs permit) to auto-fill results; manual entry remains the universal path.

### G. Billing, Credits, and Metering

**REQ-G01 [Must]:** Four subscription tiers billed monthly via Stripe: Free, Creator $10, Pro $60, Studio $200 (annual with 2 months free at launch is optional). Self-serve upgrade/downgrade/cancel via Stripe Customer Portal.
**REQ-G02 [Must]:** A credit system meters generation. Credits are an internal unit decoupled from model tokens; every operation type has a configurable credit cost (see pricing table). Monthly credits reset on the billing anniversary; unused credits roll over one month on paid tiers, capped at one month's allowance.
**REQ-G03 [Must]:** When credits run out, the user can buy overage packs (default $10 per 1,000 credits, valid 12 months, consumed after monthly credits) or enable auto-top-up with a monthly spend cap they set. Generation is blocked, with a clear prompt, when balance is zero and auto-top-up is off.
**REQ-G04 [Must]:** The credit ledger is append-only: every debit references the generation, every credit references its source (subscription grant, pack purchase, refund, promo). Balance is derived, never stored as a mutable counter.
**REQ-G05 [Must]:** Credit costs per operation and monthly allowances live in versioned config changeable without deploy; an internal dashboard reports gross margin per tier (model spend vs revenue) weekly. Launch numbers below are indicative and must be tuned against real model costs before public launch.
**REQ-G06 [Must]:** Webhook-driven billing state: subscription created/updated/cancelled, payment failed (grace period 7 days, then downgrade to Free), pack purchased. All billing state changes are idempotent on Stripe event IDs.
**REQ-G07 [Should]:** Usage page: current balance, this month's burn by mode, days-to-empty estimate, invoices - plus the brain-as-asset view: brain version count, tested rules, and logged results, so the accumulating value is visible at the moment of any cancel decision.
**REQ-G08 [Must]:** Pause instead of cancel: any paid subscription can pause for 1-3 months (Stripe pause_collection). While paused: no charges, no monthly grants, credits frozen (expiry clocks suspended), brain and history fully preserved, read-only access. The cancel flow always offers pause first; resuming restores everything. A win-back email 7 days before pause end shows what their brain has waiting.

**Pricing and allowances (launch defaults, all tunable via config):**

| | Free | Creator $10 | Pro $60 | Studio $200 |
|---|---|---|---|---|
| Monthly credits | 25 | 250 | 2,000 | 8,000 |
| Creator profiles | 1 (lite brain) | 1 | 1 | 5 |
| Seats | 1 | 1 | 1 | 3 |
| Modes | Hooks, Captions, Ideas | All 7 | All 7 | All 7 |
| Trend monitor | Weekly digest, read-only | 1 niche + Spin | 3 niches + Spin | 10 niches + Spin |
| Performance log + learning | View only | Full | Full | Full |
| Private frameworks | - | - | Yes | Yes |
| Series planner | - | - | Yes | Yes |
| API access | - | - | - | Yes |
| Rollover | No | 1 month | 1 month | 1 month |

**Credit costs (launch defaults):** hook set 2, caption 1, ideation batch 3, full script (modes 1-3) 5, autopsy 4, spin 5 (autopsy cached separately), onboarding brain build 0 (included once per profile), revision of an existing output 2, trend feed browsing 0.

### H. Marketing Site

**REQ-H01 [Must]:** Public site: landing page (positioning, live demo of a spin on a sample brain, pricing, FAQ), pricing page wired to checkout, terms/privacy, and a changelog. Fast, static-rendered, SEO-basic.
**REQ-H02 [Must]:** The landing page demo is the comparison proof: a visitor picks or types an idea and sees the same idea generated twice, side by side - generic (no brain) vs through a clearly-labelled fictional sample creator brain, with the brain's rules that shaped the output highlighted inline. This is the product's answer to "why not just ChatGPT" rendered in one screen. Zero credit cost, rate-limited by IP.
**REQ-H03 [Should]:** A public "framework of the week" page as content marketing, drawn from the shared library, curator-approved.
**REQ-H04 [Should]:** Affiliate program for creator educators: 30% recurring commission for 12 months, tracked via an off-the-shelf Stripe-native tool (Rewardful or Tolt), self-serve signup, marketing-claims policy bound by REQ-I04 (affiliates may not promise virality on the product's behalf). Ships post-launch, not launch-blocking.
**REQ-H05 [Could]:** In-product referral: give 200 credits, get 200 credits on the referred user's first paid month. Credits, not cash - referral rewards feed usage.

### I. Integrity Guardrails (all Must, carried from Cutdown REQ-160-166)

**REQ-I01:** No fake-engagement features, ever, and no guidance on evading platform enforcement.
**REQ-I02:** No verbatim reproduction of third-party content; the spin similarity gate (REQ-E04) is a hard release gate on output.
**REQ-I03:** No invented personal specifics in any output; unknown details render as `[check]` placeholders the creator fills.
**REQ-I04:** No predicted score is ever presented as a guarantee of reach or sales; "why this performs" always names the weakest point.
**REQ-I05:** Generated output is the creator's to disclose; the product provides platform-appropriate AI-assistance disclosure guidance but never advises concealment.

### J. Admin and Curation

**REQ-J01 [Must]:** Admin surface: framework curation queue (approve/edit/reject/merge), trend source management, saturation flags, user/subscription lookup, credit adjustments with reason codes, margin dashboard (REQ-G05).
**REQ-J02 [Should]:** Prompt/rule versioning: the assembled system context per mode is versioned, and every generation records which versions produced it, so quality regressions are diagnosable.

## 5. Success Metrics

1. **Activation:** % of signups that complete onboarding and generate a first script within 24h. Target 40% by day 90.
2. **The product's own kill test - baseline uplift:** % of active creators with ≥3 logged results where at least one system-generated post beats their own baseline on their declared metric. Target: 50% of creators with enough data by day 90. Reported with n and confounders, never as a pooled average. (Engineering completion and evidence completion are reported separately, always.)
3. **Conversion:** Free→paid ≥5% by day 90; logo churn on paid <8%/month.
4. **Unit economics:** blended gross margin on model spend ≥70% at Creator, ≥60% at Pro/Studio heavy use.
5. **Library growth:** curator-approved frameworks and their evidence entries per month (leading indicator of the moat).

## 6. Out of Scope (v1)

Video rendering and editing (the parked Cutdown execution layer; revisit only after retention is proven), auto-publishing, engagement automation of any kind, brand/agency approval workflows, mobile native apps (responsive web only), fine-tuned models per creator (brains are context, not weights), scraping closed platforms, guarantee-of-performance claims.

## 7. Open Decisions

1. **Name and domain** - "Respin" is a placeholder; run domain research before the marketing site ships.
2. **Trend source order** - resolved by R-11: YouTube Shorts is the launch wedge and the YouTube Data API the day-one source. The second source (licensed TikTok/IG data) is chosen from pilot demand. See `gtm.md` for the full go-to-market plan.
3. **Vivian asset boundary** - **resolved by R-29 (2026-08-19, owner-confirmed in writing)**: the shipped shared library seeds from mechanism-level frameworks only (F1-F9 generalised); her voice, log, and personal specifics never enter the product. The same rule R-9/REQ-D04 applies to every creator session, applied to the seed corpus. M2's library-seeding task is unblocked.
4. **Free-tier abuse posture** - credit-gated already; decide whether Free requires a card after observing abuse, not before.
5. **Annual pricing** - decide after 60 days of monthly cohort data.
