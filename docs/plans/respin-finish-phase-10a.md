# Slice 10a: Public surface + observability

## An anonymous visitor can…
**Type an idea on the landing page, see it generated twice side by side — generic versus through a clearly-labelled fictional sample brain, with the rules that shaped the output highlighted — and subscribe.**

## …and an operator can
**Induce an error in production and see it in the collector, with no creator content in it.**

Two sentences, because observability has no user path and a slice that shipped it alone would be substrate. The demo is the acceptance walk; the observability half is walked by an operator and is not "done" until someone has actually seen an induced error arrive.

## Why this shape

- **Today's landing demo is hardcoded copy and the file says so** — `app/(marketing)/page.tsx:5-7`: *"The real comparison demo (REQ-H02) still lands at M6; this page renders the mockup's illustrative before/after, not product output."* This slice makes it real, and **that disclosure must come down in the same change** or the product ships a screen calling its own live demo a mockup. `tests/stale-disclosure.test.ts` exists precisely to pair a disclosure with the code fact that would falsify it.
- **There is no observability of any kind.** No Sentry, no PostHog, no OpenTelemetry, no logging library, no `instrumentation.ts`, and **no observability environment variable in `env.example`**. Everything is `console.*`. The one metrics module (`packages/credits/src/metrics.ts`) is deliberately package-internal and pinned as such by `isolation.test.ts:373-376`, so `app/**` cannot emit or redirect money-path telemetry — a property to preserve, not to work around.
- **There is no application-level rate limiting.** The only limiter is Better Auth's, on its own endpoints, keyed on the resolved client IP. A public surface that reaches a model is the first thing in this product that an anonymous stranger can make spend money.

## Open items closing here
**G-15** — the import-time throw in `brain-content.ts:418`, recorded ACCEPTED in R-33 with no code moved. Its trigger is "slice 10a's observability pass, **or** the first deploy where a schema-registry edit ships without a full CI run". This is that pass.

## Prerequisites
- [ ] Slices 8 and 9 shipped (the demo spins, so the pipeline it demonstrates is the real one)
- [ ] **A red test is fixed first, and it is red now.** `tests/gate-completeness.test.ts:626` fails on `app/(marketing)/for/[audience]/page.tsx` — an entrypoint added by the concurrent marketing stream with no `PUBLIC_ENTRYPOINTS` entry. It is the same failure the slice-3 ledger reports as "1264/1265". **It should be fixed the day someone reads this, not carried to slice 10a** — a default-deny gate suite that is habitually red is a gate suite nobody trusts

---

## The three questions the stub left open, answered

### 1. Whose brain does the demo run on, and what asserts it is not a real creator's?

**A checked-in fixture, not a database row — and that is the assertion.**

The weak version of this is a seeded `creator_profiles` row flagged `is_sample`, with a test asserting the flag. That test proves a boolean, not a property: the row lives in the same table as real creators, reachable by the same accessors, and one query without the flag predicate leaks a real brain onto a public page.

The strong version is structural, and it costs less: **the sample brain is a fixture file, the demo path never mints a `ProfileScope`, and therefore there is no profile it could read.** REQ-A03's isolation is not "enforced" on this path — it is unreachable, which is the same argument the M2a cage rests on.

**What is still owed:** the fixture is content, and R-29's rule applies to it — no real person's voice, specifics, numbers or performance data. Reuse the mechanism-level content validator that slice 7 ships with the framework library and slice 8 applies to proposals; do not create a third scan.

### 2. What is the rate limit, and does it reuse `rate_limit`?

**A separate limiter, keyed by HMAC over a canonical IP — it does not reuse `rate_limit`.**

`rate_limit.key` holds a **plaintext client IP** with a 24-hour retention sentence (R-26) and **no receiver until slice 10b**. Reusing it means the first public surface in the product adds plaintext IPs, at internet volume, to a store whose retention policy is in force and unexecuted. That is the wrong direction on the one slice before the receiver lands.

Use a versioned server-secret HMAC over a canonical IPv4/IPv6 representation. A salt-only hash is
forbidden: the IP address space is small enough to brute-force. Retain only the HMAC bucket for the
shortest limit/debug window, support key rotation, and never claim it is anonymous. This also keeps the
two limiters separable: Better Auth owns its table and runtime contract (`auth-schema.ts:85-102`).

**The limit itself is a spend bound, so it is set from spend, not from feel**: the demo costs us two vendor calls per run (generic + brained), at Haiku-class classification pricing where possible. Code sets a **ceiling**; configuration may only lower/tighten it. Calling this a floor reverses the safety property.

### 3. Is this one slice, or does observability split off?

**One slice, with two acceptance walks (see the top of this card).**

Observability alone has no creator path, so it would be substrate — the shape this whole plan exists to prevent. The demo alone is a public surface that reaches a model with no way to see it failing. Together they are coherent: **the first anonymous, unauthenticated, money-spending surface in the product is also the first one that needs to be watchable.**

**What does split off:** the PostHog activation funnel (signup → brain → first script) is analytics, not error reporting, and it depends on events emitted across slices 3, 5 and 6. If it is not buildable inside this slice's budget, it is **cut with its reason recorded** rather than half-instrumented — a funnel missing one step reports a false drop-off, which is worse than no funnel.

---

## Requirements

### The comparison demo (REQ-H02 / R-14)
- [ ] **R1:** A visitor types or picks an idea and sees **the same idea generated twice, side by side** — generic (no brain) versus through the fictional sample brain — with the brain's rules that shaped the output **highlighted inline**. The highlighting is the point: it is the product's answer to "why not just ChatGPT" and a demo without it is two paragraphs.
- [ ] **R2:** The sample brain is a fixture and the demo path mints no `ProfileScope` (question 1), asserted by the AC-13 cage scan rather than by a comment.
- [ ] **R3:** **Zero credit cost** (REQ-H02). The demo debits nothing and touches no ledger.
- [ ] **R4:** **IP rate-limited** per question 2, with canonical-IP keyed HMAC, short retention, key version/rotation, a code ceiling and config-may-only-tighten clamp.
- [ ] **R4a:** The demo also has atomic global daily vendor-cost and concurrency ceilings, maximum input length, maximum output tokens, overall timeout and prompt fencing that treats visitor text only as data. Every ceiling is checked before outbound work when possible; two-call runs reserve/release their full budget safely.
- [ ] **R5:** The two outputs **genuinely differ in voice and structure** — M6's acceptance criterion, and it is a property of output, so the honest instrument is a fixture set plus a human looking, and the card says so rather than claiming a test proves it.
- [ ] **R6:** The demo runs the **real pipeline** (`packages/modes`), not a second implementation. A demo that diverges from the product is a marketing asset, and REQ-H02 calls it proof.
- [ ] **R7:** `app/(marketing)/page.tsx:5-7`'s "this is a mockup" disclosure is removed, and `tests/stale-disclosure.test.ts` gains the pairing that would catch it going stale in the other direction.
- [ ] **R8:** The demo makes **no guarantee** (REQ-I04) and names the weakest point of what it produces, exactly as the product does. `tests/support/forbidden-claims.ts` runs over the real rendered copy.

### The public surface (REQ-H01)
- [ ] **R9:** Pricing wired to checkout; terms and privacy pages; a changelog. `tests/landing-pricing.test.ts` already pins prices, allowances and profile caps to `CONFIG_V1_SEED` and bans digits in the mechanic tags — **new copy that states a number joins that binding** rather than restating it.
- [ ] **R10:** Every new public entrypoint is added to `PUBLIC_ENTRYPOINTS` with a written `why` (`tests/gate-completeness.test.ts:186-199`). The default-deny suite is the mechanism; the prerequisite above is why it must be green first.
- [ ] **R11:** The privacy page's capability claims are **true of the code that exists**. This is the outbound-truth rule, and the specific hazard is a privacy policy describing a deletion path that lands in slice 10b.

### Observability
- [ ] **R12:** Error reporting exists and **carries no creator content**. `app/(product)/safe-log.ts`'s rule — *"a message is safe to log iff we wrote it"* — is the contract, and the collector integration must not widen it. The `DrizzleQueryError` bound-parameter leak that rule exists for (R-36) is exactly what an error reporter would otherwise ship to a third party.
- [ ] **R13:** Structured logs carry a request id (tech-spec §7). `console.*` with a correlation id is an acceptable answer; a logging library is not required by anything.
- [ ] **R14:** `packages/credits/src/metrics.ts` stays package-internal. `isolation.test.ts:373-376` pins it; the observability work must route around that rather than through it.
- [ ] **R15:** Every new configuration value is documented in `env.example`, which today documents ten and is the operator's only inventory.
- [ ] **R16:** **G-15 closed.** `brain-content.ts:418`'s import-time `assertRegistryClosed` throw makes an unimportable `@respin/db` a 500 on every Stripe delivery with no env escape. R-33 accepted it on likelihood and billing named the axis it does not reach — blast radius. This is the pass that owes it a resolution: move it, give it an escape, or record a third refusal with the deploy check that makes the likelihood argument true.
- [ ] **R17:** **The observability walk is real** — an induced error in a deployed process appears in the collector, and it is checked that no prompt, completion, post text or brain content came with it.

### The activation funnel (REQ-G05 metric 1)
- [ ] **R18:** The signup → brain → first script funnel reports, **or is cut with its reason recorded** (question 3). It is not half-instrumented.

---

## Left to the developer

- **The demo's input surface** — free text, a picker, or both. Free text is a prompt-injection surface reaching a model on an unauthenticated path; whichever is chosen, the input is data, never instruction.
- **The collector.** Sentry is named in tech-spec §7 and nothing depends on it being Sentry.
- **Where the HMAC key/version live** (question 2) — secret management plus rotation is documented per R15; never reuse an auth/session secret.
- **Test file layout.**

## Tasks
1. [ ] **Fix the red `gate-completeness` test** (prerequisite)
2. [ ] The sample-brain fixture + the mechanism-level content scan (R2, question 1)
3. [ ] The demo path: real pipeline, zero credit, no `ProfileScope` (R1, R3, R6)
4. [ ] The keyed-HMAC IP limiter, code ceiling/config clamp, global daily cost + concurrency reservations, input/output/deadline bounds and prompt fence (R4/R4a)
5. [ ] Rule highlighting + the difference fixtures (R1, R5)
6. [ ] Remove the mockup disclosure; add the stale-disclosure pairing (R7)
7. [ ] Pricing/legal/changelog + `PUBLIC_ENTRYPOINTS` entries + the number bindings (R9–R11)
8. [ ] Error reporting with the safe-log contract; request ids; `env.example` (R12–R15)
9. [ ] G-15's resolution (R16)
10. [ ] The activation funnel, or its recorded cut (R18)
11. [ ] Walk both: the demo in a browser as an anonymous visitor; an induced error in the collector

## Files — *expected surface. Deviate and say why in the ledger; this is not a contract.*
| File | Action | Purpose |
|---|---|---|
| `respin/app/(marketing)/**` | Modify | The live demo, pricing, legal, changelog; the disclosure removal |
| `respin/app/api/demo/route.ts` | Create | The anonymous demo endpoint, rate-limited, zero-credit |
| `respin/packages/modes/src/demo-brain.ts` | Create | The fixture sample brain (question 1) |
| `respin/packages/db/src/rate-limit-demo.ts` | Create | Keyed-HMAC IP buckets plus atomic global budget/concurrency reservations |
| `respin/packages/config/src/schema.ts` | Modify | Demo limits, clamped to compiled ceilings |
| `respin/instrumentation.ts` | Create | The collector wiring |
| `respin/app/(product)/safe-log.ts` | Modify | The collector path, same contract |
| `respin/packages/db/src/brain-content.ts` | Modify | G-15's resolution (R16) |
| `respin/env.example` | Modify | The collector, the salt, the funnel key |
| `respin/tests/gate-completeness.test.ts` | Modify | `PUBLIC_ENTRYPOINTS` for every new public page |
| `respin/tests/stale-disclosure.test.ts` | Modify | R7's pairing |
| `respin/tests/landing-pricing.test.ts` | Modify | R9's bindings for any new number |

## Verification
1. [ ] Entry gate on the CI shape, Docker live, zero skips; `db:check` clean
2. [ ] **As an anonymous visitor in a browser: type an idea → two outputs → the rules highlighted → subscribe** (M6's criterion)
3. [ ] The two outputs differ in voice **and** structure (R5) — fixtures plus a human verdict, reported as such
4. [ ] The demo debits nothing — the ledger is unchanged after N runs (R3)
5. [ ] Exceeding the limit → refused, and the refusal does not leak whether the IP is known (R4)
6. [ ] Config cannot raise any demo limit above its code ceiling (R4/R4a)
7. [ ] The demo path mints no `ProfileScope` (R2, AC-13 scan)
8. [ ] The sample brain's content contains no real person's specifics (question 1's scan)
9. [ ] An induced error reaches the collector **with no creator content in it** (R12, R17)
10. [ ] `env.example` documents every new variable (R15)
11. [ ] Every public page is in `PUBLIC_ENTRYPOINTS`; the suite is green (R10)
12. [ ] Race requests at IP/global-cost/concurrency ceilings → accepted work never exceeds a ceiling; timeout/input/output/prompt-injection fixtures fail safely (R4/R4a)
13. [ ] HMAC rotation preserves the intended overlap window and expires old buckets; a salt-only hash implementation fails the invariant test (R4)

## Mutations to plant (name the population)
| # | Mutation | Should redden |
|---|---|---|
| M1 | Demo path mints a `ProfileScope` | Verification 7 |
| M2 | Rate limiter disabled | Verification 5 |
| M3 | Config allowed to exceed the code ceiling | Verification 6 |
| M4 | Demo debits a credit | Verification 4 |
| M5 | Error reporter passes the raw error object | Verification 9 |
| M6 | Demo reimplemented instead of calling `packages/modes` | R6's shared-path test |
| M7 | Sample brain seeded as a database row | Verification 7 / the fixture assertion |
| M8 | Demo global daily budget or concurrency reservation removed | Verification 12 |
| M9 | IP key changed to an unkeyed/salted digest | Verification 13 |

**Population note — read before reporting "N of N".** Seven mutations on code that will exist. **The hazards this matrix cannot reach:** (a) **R5 is the slice's headline and is a property of generated text** — "genuinely differ in voice and structure" cannot be proven by a test, only sampled; report it as a sampled verdict with its n, never as coverage. (b) **R11 is outbound truth** — a privacy page describing slice 10b's deletion path would pass every test in the repo, because no test reads the privacy page against the code. (c) **R17 is an operator walk**, and the thing it checks is an absence (no creator content in the payload), which no mutation of our code can create — the leak would come from a library's error shape, which is the exact class R-36's `safe-log` rule was written for after `DrizzleQueryError` printed a creator's post to stdout. Before claiming a matrix result, state which requirements have no control, and have someone other than the author plant at least three mutations against the demo path.

## Done when
- [ ] All requirements met, all verification steps pass
- [ ] **Both** walks done — the visitor's in a browser, the operator's against a deployed process
- [ ] **Spin compliance**, **billing** (Full gates), **learning honesty** and **brain tenancy** (Full gates) PASS — reviewers in **isolated worktrees**
- [ ] G-15 closed in the disposition register, whichever way it resolves
- [ ] `decisions.md` carries: the fixture-not-a-row sample brain, keyed-HMAC IP limiter/rotation and why `rate_limit` was not reused, demo code ceilings/config tightening, G-15's resolution, and the funnel's build-or-cut
- [ ] `build-plan.md` M6's demo and funnel criteria are measured; remaining M6 criteria belong to 10b-1, 10b-2 and 10c and are **not** claimed here
