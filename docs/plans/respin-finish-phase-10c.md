# Slice 10c: Launch contract — abuse, Studio API, disclosure

## A creator can…
**Create a scoped Studio API key, call a versioned generation endpoint with the same protections as the UI, and receive output with platform-specific AI-assistance disclosure guidance.**

An anonymous visitor can still use the demo and a verified Free creator can still start without a
card, but neither path can create unbounded vendor spend. This slice owns the M6 obligations that
were absent from 10a/10b: the thin API, full Free/demo abuse controls, disclosure guidance and FAQ.

## Prerequisites

- [ ] Slice 10b-2 is closed; API-key and abuse-event retention/deletion are in the registry before data is written.
- [ ] The seven-mode generation pipeline has one callable service boundary; the API must reuse it rather than reproduce prompts, credit logic or kill tests.

---

## Requirements

### Thin Studio API

- [ ] **R1:** Owners create, rotate and revoke API keys. Store only a keyed hash plus a non-secret prefix, show the secret once, bind it to one workspace/profile and explicit scopes, and audit lifecycle events without logging the secret.
- [ ] **R2:** Ship a versioned REST surface (`/api/v1/...`) for the seven Studio modes. Request/response schemas, status codes, rate-limit headers and copy-paste examples are documented and contract-tested.
- [ ] **R3:** Every request authenticates the key, derives scope server-side, applies the same role/tier/mode, input, reference-safety, kill-test, concurrency, balance and debit gates as the UI, and records the exact brain/context versions used.
- [ ] **R4:** A required idempotency key plus server request id gives one logical attempt, at most one vendor execution and one terminal generation/debit. Same key + different payload refuses; safe retries return the prior terminal result.
- [ ] **R5:** Errors are structured and content-safe: stable code, human message, corrective action, documentation link and request id. Prompt/completion text, API secrets and raw creator content never enter logs or error telemetry.

### Free and demo abuse budget

- [ ] **R6:** Free requires verified email but no card. Apply per-IP, account and workspace velocity limits plus a global daily vendor-spend ceiling and bounded concurrency. Configuration may only tighten the compiled ceilings.
- [ ] **R7:** The anonymous demo has independent per-IP velocity, global daily spend and concurrency ceilings, maximum input/output sizes, timeout and prompt fencing. It fails closed before a vendor call when any ceiling is exhausted.
- [ ] **R8:** IP controls use a keyed HMAC over a canonical IP representation with key rotation/versioning and short retention. A salt-only hash is forbidden because the address space is brute-forceable. Device fingerprinting is out of scope by default.
- [ ] **R9:** Limit decisions are atomic under concurrency, observable without creator content, and produce honest retry/reset guidance. Multi-account abuse is detectable through aggregate counters without claiming perfect identity detection.
- [ ] **R10:** A product-wide daily vendor-spend hard ceiling covers Free, demo and system jobs. It pages before exhaustion and hard-refuses after exhaustion; no product path can override it upward at runtime.

### Disclosure and launch help

- [ ] **R11:** Every generated or spun output includes concise, platform-specific guidance about when/how to disclose AI assistance. It never advises concealment, evasion or false authorship and is clearly guidance rather than legal advice.
- [ ] **R12:** A launch FAQ covers billing/credits, retries/idempotency, supported modes, brain provenance, references/copyright, AI disclosure, data retention/deletion, seats, API keys, limits and support/escalation.
- [ ] **R13:** PRD H03/H04/H05 items not required for the M6 acceptance walk are listed in `docs/TODOS.md` with an owner and trigger; they are not silently treated as shipped.

## Tasks

1. [ ] Add API-key schema, one-time reveal flow, scoped verifier, revocation/rotation and audit events.
2. [ ] Extract/reuse the single Studio service boundary and expose versioned mode endpoints with idempotency.
3. [ ] Implement atomic Free/demo/product-wide spend and concurrency limits with keyed-HMAC IP buckets.
4. [ ] Add disclosure guidance to the shared generation presenter used by UI and API.
5. [ ] Publish API reference, copy-paste example, structured error catalogue and launch FAQ.
6. [ ] Register API/abuse data in retention, export and deletion policy; run privacy/security review.

## Files — expected surface; re-read before implementation

| File | Action | Purpose |
|---|---|---|
| `respin/packages/db/src/**` + migration | Modify/Create | API keys, audit events and atomic limit counters |
| `respin/packages/credits/src/**` | Modify | Shared attempt/idempotency and product-spend ceilings |
| `respin/packages/modes/src/**` | Modify | One UI/API mode service and disclosure metadata |
| `respin/app/api/v1/**` | Create | Versioned authenticated Studio API |
| `respin/app/(product)/settings/api-keys/**` | Create | Owner key lifecycle UI |
| `respin/app/(marketing)/docs/**` | Create | API guide, error catalogue and examples |
| `respin/app/(marketing)/faq/**` | Create/Modify | Launch FAQ |
| `respin/tests/**` | Modify/Create | Contract, abuse, concurrency, disclosure and redaction tests |

## Verification

1. [ ] Create a key, copy the one-time secret, call one mode, retry with the same idempotency key and observe one vendor execution/generation/debit.
2. [ ] Reuse the key with a changed body, another workspace/profile, a revoked key and an unowned scope; each refuses before vendor execution.
3. [ ] Race limit counters at every ceiling; accepted calls never exceed the compiled/configured cap and refusal includes reset guidance.
4. [ ] Exhaust demo, Free and global budgets independently; each stops the correct population and the global ceiling stops all vendor work.
5. [ ] Inspect logs/errors/audit rows for planted secrets and creator text; none are emitted.
6. [ ] Generate/spin for every supported platform; disclosure guidance is present, specific and contains no concealment advice.
7. [ ] Follow a clean-room API example in under five minutes without repository knowledge.

## Mutations to plant

| # | Mutation | Should redden |
|---|---|---|
| M1 | Store a plaintext API secret | secret-storage/schema test |
| M2 | Trust workspace id from the API body | cross-tenant contract test |
| M3 | Call the vendor before claiming idempotency | duplicate/concurrency test |
| M4 | Raise a limit through runtime configuration | code-ceiling test |
| M5 | Replace keyed HMAC with a salt-only IP hash | privacy invariant test |
| M6 | Remove the global spend ceiling from demo | budget-exhaustion test |
| M7 | Omit disclosure guidance from Spin | platform disclosure matrix |
| M8 | Log a request body on a 500 | content-redaction test |

## Done when

- [ ] The creator/API/anonymous acceptance walks pass and the external-call/worker gates in the master plan are green.
- [ ] Studio API, Free/demo abuse, I05 disclosure and FAQ rows are all evidenced in the M6 coverage matrix.
- [ ] Security, billing, tenancy and compliance Critical-Path reviews pass on this slice.
