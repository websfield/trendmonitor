// M1 phase 4 UI suite. Every Edge-Case bullet and every Failure-Mode row of
// `docs/plans/respin-m1-phase-4.md` has a NAMED test here (AC-3), plus the
// cancel-order rule (B4/REQ-G08), the error-copy completeness assertion, and
// the keyless degraded renders that AC-5 asks for.
//
// These drive the PURE view components with fixtures. That is deliberate and it
// is the limit worth stating: the page components themselves (gate → scope →
// read) are NOT executed here — they need a session and a database — so what is
// proven is "given this state, the page renders this", not "the page computes
// this state". The state-computing half lives in packages/credits and was
// tested there in phases 2–3.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as creditsFacade from "@respin/credits/app-server";
import * as configFacade from "@respin/config/app-server";
import { WorkspaceAccessError } from "@respin/db";
import * as dbFacade from "@respin/db";
import {
  APP_LOCAL_ERROR_CLASS_NAMES,
  BILLING_ERROR_CODES,
  BILLING_ERROR_COPY,
  HANDLED_ERROR_CLASS_NAMES,
  type BillingErrorCode,
  billingErrorCode,
  billingErrorDisplay,
  billingErrorFromCode,
} from "../app/(product)/billing-errors";
// The VALUE, from the package that owns the closed set — `billing-errors.ts`
// writes the four reasons out because the union TYPE is not on the facade, and
// a test that repeated that list would be a third copy of it.
import { REVISION_PARENT_REFUSALS } from "@respin/credits";

/** This file's own directory — the anchor for the source reads below. */
const HERE = dirname(fileURLToPath(import.meta.url));
import {
  UsageView,
  burnByModeNote,
  daysToEmptyNote,
  spendVisibility,
  type UsageViewProps,
} from "../app/(product)/usage/usage-view";
import {
  BURN_PERIOD_COPY,
  InsufficientCreditsError,
  LlmError,
  PostCallDebitError,
} from "@respin/credits/app-server";
// `LlmError` — the BASE class, which is the whole point. The facade
// deliberately re-exports only this one, because `app/**` renders one sentence
// per outcome and enumerating subclasses there would be a second
// classification of vendor failures beside the `billable` flag that already
// travels on the error. So the routing is asserted on the FLAG, which is the
// property, rather than on a list of subclasses that would drift. That the
// real subclasses set the flag correctly is `packages/llm`'s own suite.
import {
  BillingView,
  type BillingViewProps,
} from "../app/(product)/settings/billing/billing-view";
import {
  ConfigEditorForm,
  ConfigHistory,
} from "../app/(admin)/admin/config/config-view";
// The pages' OWN copy modules — imported so the assertions bind to the strings
// a real render produces (round-2 CHANGE 7), not to look-alike fixtures.
import { STRIPE_REMEDY as PAGE_STRIPE_REMEDY } from "../app/(product)/settings/billing/copy";
import {
  NO_BILLING_ACCOUNT_REASON,
  PORTAL_NOT_OWNER_REASON,
  portalAvailability,
} from "../app/(product)/usage/copy";
import {
  NO_ACTIVE_CONFIG_COPY,
  resolveSavedVersion,
} from "../app/(admin)/admin/config/config-form-state";
import { AccessRefusal } from "../app/(product)/access-refusal";

const NOW = new Date("2026-08-17T00:00:00Z");
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

// ---------------------------------------------------------------- fixtures

function usageProps(over: Partial<UsageViewProps> = {}): UsageViewProps {
  return {
    balance: { ok: true, value: 250, asOf: NOW },
    burn: { ok: true, hasAnyDebit: false },
    // R17a: the period the burn numbers were queried over, REQUIRED since the
    // learning-honesty pass. It was optional purely so this fixture could stay
    // unchanged — and an optional prop standing in for a required one, held up
    // by a source scan, is the shape this repo has recorded twice (2026-08-26,
    // 2026-08-29). Making it required is what forces every renderer of this
    // panel to say which window its numbers cover; the behavioural assertions
    // that the LINE renders and that the noun is tier-correct live in
    // `tests/usage-honesty.test.tsx`.
    // `calendar_month`, because that is the window this fixture's workspace is
    // actually in and because its noun ("this month") is the one the removed
    // fallback used — so making the prop required changes no assertion in this
    // file. The billing-cycle half is driven in `tests/usage-honesty.test.tsx`,
    // which owns the tier-correctness of the noun.
    period: {
      start: NOW,
      ...BURN_PERIOD_COPY.calendar_month,
    },
    // R17a (slice 6): an answered, empty split — the shape a workspace that
    // has spent nothing this period really produces. The split's own states
    // are driven in `usage-burn-by-mode.test.ts`, which owns that panel.
    burnByMode: {
      ok: true,
      byMode: [],
      notAGeneration: { credits: 0, debits: 0 },
      nonTerminalClaim: { credits: 0, debits: 0 },
    },
    rows: [],
    moreRows: false,
    paused: null,
    portal: { available: true, action: "/portal" },
    error: null,
    billingHref: "/settings/billing",
    ...over,
  };
}

const CONFIG_OK: Extract<BillingViewProps["config"], { ok: true }> = {
  ok: true,
  version: 2,
  tiers: [
    { tier: "creator", label: "Creator", monthlyCredits: 250, priceMapped: true },
    { tier: "pro", label: "Pro", monthlyCredits: 2000, priceMapped: true },
    { tier: "studio", label: "Studio", monthlyCredits: 8000, priceMapped: true },
  ],
  pack: { credits: 1000, priceUsd: 10, mapped: true },
  pauseMonths: { min: 1, max: 3 },
};

// THE REAL STRING THE PAGE RENDERS, imported — not a fixture that resembles it.
//
// AC-5's ledger snapshot quoted `(see respin/env.example)` and "as
// `stripePriceMap`" as part of a keyless render, and neither string existed
// anywhere a test could see: the suite's fixture was a DIFFERENT, shorter
// remedy, so the words a keyless install actually shows were asserted by
// nothing and `pnpm stripe:setup` could have been deleted from them with the
// suite still green (round-2 CHANGE 7).
const STRIPE_REMEDY = PAGE_STRIPE_REMEDY;

function billingProps(over: Partial<BillingViewProps> = {}): BillingViewProps {
  return {
    state: { tier: "creator", state: "active" },
    isOwner: true,
    hasLiveSubscription: true,
    hasStripeCustomer: true,
    autoTopup: { enabled: false, monthlyCapCents: null },
    config: CONFIG_OK,
    stripe: { configured: true, remedy: STRIPE_REMEDY },
    error: null,
    showCancel: false,
    actions: {
      subscribe: "/a/subscribe",
      pack: "/a/pack",
      portal: "/a/portal",
      recoverInvoice: "/a/recover-invoice",
      pause: "/a/pause",
      resume: "/a/resume",
      autoTopup: "/a/autotopup",
    },
    cancelHref: "/settings/billing?cancel=1",
    usageHref: "/usage",
    ...over,
  };
}

// ------------------------------------------------- Edge Cases (plan table)

describe("edge bullet: zero-balance user opens the usage page", () => {
  it("shows 0 and a top-up prompt pointing at billing (REQ-G03's clear prompt)", () => {
    const out = html(<UsageView {...usageProps({ balance: { ok: true, value: 0, asOf: NOW } })} />);
    expect(out).toContain('data-testid="balance-value">0<');
    expect(out).toContain('data-testid="topup-prompt"');
    expect(out).toContain("/settings/billing");
  });

  it("NON-VACUITY: a non-zero balance shows no top-up prompt", () => {
    const out = html(<UsageView {...usageProps()} />);
    expect(out).not.toContain('data-testid="topup-prompt"');
    expect(out).toContain('data-testid="balance-value">250<');
  });
});

describe("edge bullet: paused workspace", () => {
  it("usage shows the frozen notice WITH the resume date", () => {
    const out = html(
      <UsageView
        {...usageProps({ paused: { resumesAt: new Date("2026-11-01T00:00:00Z") } })}
      />
    );
    expect(out).toContain('data-testid="paused-notice"');
    expect(out).toContain("2026-11-01");
    expect(out).toContain("expiry clocks are suspended");
  });

  it("usage says so honestly when NO resume date has been recorded (never a fabricated one)", () => {
    const out = html(<UsageView {...usageProps({ paused: { resumesAt: null } })} />);
    expect(out).toContain("No resume date has been recorded yet");
    // and nothing that looks like a date was invented
    expect(out).not.toMatch(/Scheduled to resume on \d{4}-\d{2}-\d{2}/);
  });

  it("settings shows the paused state and a resume control", () => {
    const out = html(
      <BillingView
        {...billingProps({
          state: {
            tier: "creator",
            state: "paused",
            resumesAt: new Date("2026-11-01T00:00:00Z"),
          },
        })}
      />
    );
    expect(out).toContain('data-testid="paused"');
    expect(out).toContain('data-testid="resume-button"');
    expect(out).toContain("2026-11-01");
  });

  it("a paused workspace's usage page still RENDERS its history (read-only, not blocked)", () => {
    const out = html(
      <UsageView
        {...usageProps({
          paused: { resumesAt: null },
          rows: [
            {
              id: "r1", createdAt: NOW, kind: "grant", delta: 250,
              expiresAt: new Date("2026-10-01T00:00:00Z"), ref: "in_123",
            },
          ],
        })}
      />
    );
    expect(out).toContain("in_123");
    expect(out).toContain('data-testid="balance-value">250<');
  });
});

describe("edge bullet: free workspace (no subscriptions row)", () => {
  it("settings offers subscribe options and NO portal control (no customer exists yet)", () => {
    const out = html(
      <BillingView
        {...billingProps({
          state: { tier: "free", state: "free" },
          hasLiveSubscription: false,
          hasStripeCustomer: false,
        })}
      />
    );
    expect(out).toContain('data-testid="subscribe-creator"');
    expect(out).toContain('data-testid="subscribe-pro"');
    expect(out).toContain('data-testid="subscribe-studio"');
    expect(out).not.toContain('data-testid="portal-manage"');
  });

  it("usage explains the missing portal link instead of showing a dead button", () => {
    const out = html(
      <UsageView
        {...usageProps({
          portal: {
            available: false,
            reason: "There is no billing account for this workspace yet.",
          },
        })}
      />
    );
    expect(out).toContain('data-testid="portal-unavailable"');
    expect(out).toContain("no billing account for this workspace yet");
    expect(out).toContain("disabled");
  });
});

describe("edge bullet: an ALREADY-SUBSCRIBED workspace gets the portal, never a second checkout (plan-review F1)", () => {
  it("renders the manage-in-portal block and no subscribe buttons", () => {
    const out = html(<BillingView {...billingProps({ hasLiveSubscription: true })} />);
    expect(out).toContain('data-testid="manage-plan"');
    expect(out).toContain("Customer Portal");
    expect(out).not.toContain('data-testid="subscribe-creator"');
  });
});

describe("edge bullet: stripePriceMap empty (setup script not run)", () => {
  it("subscribe + pack buttons are DISABLED and name the exact remedy the operator can perform", () => {
    const out = html(
      <BillingView
        {...billingProps({
          hasLiveSubscription: false,
          config: {
            ...CONFIG_OK,
            tiers: CONFIG_OK.tiers.map((t) => ({ ...t, priceMapped: false })),
            pack: { ...CONFIG_OK.pack, mapped: false },
          },
        })}
      />
    );
    expect(out).toContain("disabled");
    expect(out).toContain("pnpm stripe:setup");
    expect(out).toContain("/admin/config");
    expect(out).toContain("stripePriceMap");
  });

  it("NON-VACUITY: with prices mapped the same buttons are live forms, not disabled", () => {
    const out = html(<BillingView {...billingProps({ hasLiveSubscription: false })} />);
    expect(out).toContain('action="/a/subscribe"');
    expect(out).not.toContain("pnpm stripe:setup");
  });
});

describe("edge bullet: non-owner visits settings", () => {
  it("every mutation control is disabled and names the role rule (REQ-A02, UI half)", () => {
    const out = html(
      <BillingView {...billingProps({ isOwner: false, hasLiveSubscription: false })} />
    );
    expect(out).toContain("Only the workspace owner can change billing");
    // No live form actions at all for a non-owner.
    expect(out).not.toContain('action="/a/subscribe"');
    expect(out).not.toContain('action="/a/pack"');
    expect(out).not.toContain('action="/a/autotopup"');
    expect(out).not.toContain('action="/a/pause"');
  });

  it("NON-VACUITY: the owner sees those same controls as live forms", () => {
    const out = html(<BillingView {...billingProps({ hasLiveSubscription: false })} />);
    expect(out).toContain('action="/a/subscribe"');
    expect(out).toContain('action="/a/pack"');
    expect(out).toContain('action="/a/autotopup"');
  });
});

describe("edge bullet: admin visits /admin/config with config_versions empty", () => {
  it("renders 'no active config' plus the seed remedy — never a crash, never a default", () => {
    const out = html(
      <ConfigEditorForm
        active={{
          ok: false,
          title: "No usable configuration version",
          detail:
            "Run `pnpm db:seed` to write version 1, or paste a complete valid document below.",
        }}
        state={{ status: "idle" }}
        action="/a/config"
        savedVersion={null}
      />
    );
    expect(out).toContain("No active config");
    expect(out).toContain('data-testid="config-missing"');
    expect(out).toContain("pnpm db:seed");
    // The editor is still usable — the page that fixes the problem must load.
    expect(out).toContain("<textarea");
  });

  it("empty history renders an empty state rather than an empty table", () => {
    const out = html(<ConfigHistory rows={[]} />);
    expect(out).toContain('data-testid="config-history-empty"');
    expect(out).not.toContain("<tbody>");
  });
});

describe("edge bullet: the config editor rejects bad input", () => {
  it("shows FIELD-LEVEL issues, says no version was appended, and keeps the operator's draft", () => {
    const draft = '{"creditCosts":{"spin":"five"}}';
    const out = html(
      <ConfigEditorForm
        active={{ ok: true, version: 2, json: "{}" }}
        state={{
          status: "error",
          message: "The JSON parsed, but it is not a valid Respin configuration.",
          issues: [
            { path: "creditCosts.spin", message: "Invalid input: expected number" },
          ],
          draft,
        }}
        action="/a/config"
        savedVersion={null}
      />
    );
    expect(out).toContain('data-testid="config-form-error"');
    expect(out).toContain("creditCosts.spin");
    expect(out).toContain("No version was appended");
    // the draft, not the active document, is what the textarea holds
    expect(out).toContain("&quot;five&quot;");
  });

  it("a successful save reports the NEW version and says earlier ones are untouched", () => {
    const out = html(
      <ConfigEditorForm
        active={{ ok: true, version: 3, json: "{}" }}
        state={{ status: "idle" }}
        action="/a/config"
        savedVersion={3}
      />
    );
    expect(out).toContain('data-testid="config-saved"');
    expect(out).toContain("v3");
    expect(out).toContain("append-only");
  });

  it("history lists version, author and date (provenance for a price change)", () => {
    const out = html(
      <ConfigHistory
        rows={[
          { version: 2, createdBy: "admin_1", createdAt: NOW },
          { version: 1, createdBy: "seed", createdAt: NOW },
        ]}
      />
    );
    expect(out).toContain("v2");
    expect(out).toContain("admin_1");
    expect(out).toContain("2026-08-17");
  });
});

// ------------------------------------ Failure Modes & Degraded Behavior table

describe("failure mode: a Stripe/action error is rendered inline, typed", () => {
  it("the settings page renders the copy for the code the action redirected with", () => {
    const out = html(
      <BillingView
        {...billingProps({ error: billingErrorFromCode("already_subscribed") })}
      />
    );
    expect(out).toContain('data-testid="action-error"');
    expect(out).toContain("This workspace already has a subscription");
    expect(out).toContain("Customer Portal");
  });

  it("an UNRECOGNISED code degrades to the honest generic copy, never to raw text from the URL", () => {
    const injected = "<script>alert(1)</script> your account is closed";
    const copy = billingErrorFromCode(injected);
    expect(copy?.code).toBe("unknown");
    const out = html(<BillingView {...billingProps({ error: copy })} />);
    expect(out).toContain("Something went wrong");
    expect(out).not.toContain("your account is closed");
  });
});

describe("failure mode: a refused portal action returns to the USAGE page", () => {
  it("the usage portal form carries the allowlisted `from` value, so a refusal comes back here", () => {
    const out = html(<UsageView {...usageProps()} />);
    expect(out).toContain('name="from"');
    expect(out).toContain('value="/usage"');
  });

  it("...and the usage page renders that refusal instead of appearing to do nothing", () => {
    const out = html(
      <UsageView
        {...usageProps({ error: billingErrorFromCode("no_stripe_customer") })}
      />
    );
    expect(out).toContain('data-testid="usage-action-error"');
    expect(out).toContain("This workspace has no billing account yet");
  });
});

describe("failure mode: config unavailable on the settings page", () => {
  it("billing controls are disabled with the remedy, and NO price is guessed", () => {
    const out = html(
      <BillingView
        {...billingProps({
          hasLiveSubscription: false,
          state: { tier: "unknown", state: "unknown" },
          config: {
            ok: false,
            title: "Runtime configuration is missing or invalid",
            detail: "An operator needs to seed the database (`pnpm db:seed`).",
          },
        })}
      />
    );
    expect(out).toContain('data-testid="config-error"');
    expect(out).toContain("pnpm db:seed");
    expect(out).toContain('data-testid="state-unknown"');
    // no allowance/pack numbers are printed when config could not be read
    expect(out).not.toContain("credits per month");
    expect(out).not.toContain('action="/a/subscribe"');
  });
});

describe("failure mode: balance derivation throws", () => {
  it("the usage page shows an honest, remedy-bearing message instead of a balance", () => {
    const copy = billingErrorDisplay(
      new creditsFacade.LedgerIntegrityError(
        "row 0195aa11-2222-7333-8444-555566667777 over-consumes for cus_ABC123"
      )
    );
    const out = html(
      <UsageView
        {...usageProps({
          balance: { ok: false, title: copy.title, detail: copy.detail },
        })}
      />
    );
    expect(out).toContain('data-testid="balance-error"');
    expect(out).toContain("Your credit history could not be read");
    expect(out).toContain("contact support");
    expect(out).not.toContain('data-testid="balance-value"');
  });
});

// -------------------------------------------------- the cancel rule (AC-3)

describe("AC-3 / skill B4: the cancel flow ALWAYS offers pause first (REQ-G08)", () => {
  it("the ordinary page carries NO control that reaches cancellation — only a link into the interstitial", () => {
    const out = html(<BillingView {...billingProps()} />);
    expect(out).not.toContain('data-cancel="final"');
    expect(out).toContain('data-testid="cancel-entry-link"');
  });

  it("in the interstitial the pause OFFER renders BEFORE the cancellation control (DOM order)", () => {
    const out = html(<BillingView {...billingProps({ showCancel: true })} />);
    const offer = out.indexOf('data-testid="cancel-pause-offer"');
    const pauseForm = out.indexOf('data-testid="pause-offer-form"');
    const final = out.indexOf('data-cancel="final"');
    // Non-vacuity first: all three really are present.
    expect(offer, "pause offer heading missing").toBeGreaterThan(-1);
    expect(pauseForm, "pause form missing").toBeGreaterThan(-1);
    expect(final, "cancellation control missing").toBeGreaterThan(-1);
    expect(offer).toBeLessThan(final);
    expect(pauseForm).toBeLessThan(final);
  });

  it("the pause offer's month choices come from CONFIG bounds, not from a hardcoded 1–3", () => {
    const out = html(
      <BillingView
        {...billingProps({
          showCancel: true,
          config: { ...CONFIG_OK, pauseMonths: { min: 2, max: 4 } },
        })}
      />
    );
    expect(out).toContain('value="2"');
    expect(out).toContain('value="4"');
    expect(out).not.toContain('value="1"');
  });

  it("even when the pause offer is BLOCKED (non-owner), the cancellation control is still below it", () => {
    const out = html(
      <BillingView {...billingProps({ showCancel: true, isOwner: false })} />
    );
    const offer = out.indexOf('data-testid="cancel-pause-offer"');
    const final = out.indexOf('data-testid="cancel-final"');
    expect(offer).toBeGreaterThan(-1);
    expect(final).toBeGreaterThan(-1);
    expect(offer).toBeLessThan(final);
  });

  // THE MARKER MUST RIDE THE DISABLED BRANCH TOO (round-3 CHANGE 3).
  //
  // The AC-3 negative assertion ("the ordinary page carries NO
  // data-cancel=final") is the whole guard, and it keys on that ONE string. The
  // two renders that exercise a DISABLED cancellation control keyed on
  // `data-testid="cancel-final"` instead, so deleting `data-cancel={cancel}`
  // from ActionButton's disabled branch left all 50 billing-ui tests green
  // (probe-confirmed) — and a future cancellation control rendered disabled on
  // the ordinary page would then slip past the negative assertion entirely.
  // That is exactly the hole AC-3 exists to close, and exactly the hole the
  // phase's own adversarial re-read closed once already.
  it.each([
    ["non-owner", { showCancel: true, isOwner: false }],
    ["keyless server", { showCancel: true, stripe: { configured: false, remedy: STRIPE_REMEDY } }],
    ["no Stripe customer", { showCancel: true, hasStripeCustomer: false }],
  ] as const)(
    "AC-3 marker: a DISABLED cancellation control (%s) still carries data-cancel=final",
    (_case, over) => {
      const out = html(<BillingView {...billingProps({ ...over })} />);
      // Prove the branch under test is the DISABLED one, not the live form the
      // other AC-3 cases already cover: the disabled branch renders a <div>
      // wrapper with a `type="button" disabled` button inside it.
      const disabled = /<div [^>]*data-testid="cancel-final"[^>]*>\s*<button type="button" disabled/;
      expect(out, "this case must render the DISABLED branch").toMatch(disabled);
      expect(
        out,
        "the disabled branch dropped the marker: the 'no control on the ordinary page reaches cancellation' assertion would pass straight over it"
      ).toMatch(/<div [^>]*data-cancel="final"[^>]*>\s*<button type="button" disabled/);
      // ...and the order property still holds on the disabled branch.
      expect(out.indexOf('data-testid="cancel-pause-offer"')).toBeLessThan(
        out.indexOf('data-cancel="final"')
      );
    }
  );
});

// --------------------------------------------- AC-5: keyless degraded render

describe("AC-5: with no STRIPE_* environment the pages render degraded, with remedies", () => {
  it("settings names the missing configuration and the exact commands to fix it", () => {
    const out = html(
      <BillingView
        {...billingProps({
          hasLiveSubscription: false,
          stripe: { configured: false, remedy: STRIPE_REMEDY },
        })}
      />
    );
    expect(out).toContain('data-testid="stripe-unconfigured"');
    expect(out).toContain("STRIPE_SECRET_KEY");
    expect(out).toContain("pnpm stripe:setup");
    expect(out).toContain("/admin/config");
    // every billing control is a disabled button, not a form that would throw
    expect(out).not.toContain('action="/a/subscribe"');
    expect(out).not.toContain('action="/a/pack"');
    expect(out).toContain("disabled");
  });

  it("usage still renders the balance and history keylessly (nothing there needs Stripe)", () => {
    const out = html(
      <UsageView
        {...usageProps({
          rows: [
            {
              id: "r1", createdAt: NOW, kind: "grant", delta: 250,
              expiresAt: new Date("2026-09-17T00:00:00Z"), ref: "in_1",
            },
          ],
          // The PAGE's own string (see the copy import at the top), so this
          // render is the render the operator gets.
          portal: { available: false, reason: NO_BILLING_ACCOUNT_REASON },
        })}
      />
    );
    expect(out).toContain('data-testid="balance-value">250<');
    expect(out).toContain("2026-09-17");
    expect(out).toContain('data-testid="portal-unavailable"');
    expect(out).toContain("one is created the first time you subscribe");
  });

  it("the remedy the KEYLESS PAGE renders is the one this suite asserts (the spliced-snapshot correction)", () => {
    // Every phrase below is quoted in the AC-5 ledger entry. They are asserted
    // against `STRIPE_REMEDY` imported from the billing page's own copy module,
    // so deleting `pnpm stripe:setup` from the operator's remedy turns this red
    // instead of leaving the ledger quoting a string nothing renders.
    for (const phrase of [
      "STRIPE_SECRET_KEY",
      "respin/.env.local",
      "(see respin/env.example)",
      "pnpm stripe:setup",
      "/admin/config",
      "`stripePriceMap`",
    ]) {
      expect(PAGE_STRIPE_REMEDY, `the page remedy must name ${phrase}`).toContain(
        phrase
      );
    }
    const out = html(
      <BillingView
        {...billingProps({
          hasLiveSubscription: false,
          stripe: { configured: false, remedy: PAGE_STRIPE_REMEDY },
        })}
      />
    );
    // ...and it reaches the HTML (apostrophes/backticks survive escaping).
    expect(out).toContain("see respin/env.example");
    expect(out).toContain("stripePriceMap");
  });
});

// ---------------------------------- REQ-A02 on /usage (round-2 CHANGE 6)

describe("REQ-A02: the portal control on /usage is owner-only, like its twin on billing", () => {
  it("a NON-OWNER gets no live form and is told why (the action would throw anyway)", () => {
    const out = html(
      <UsageView
        {...usageProps({
          portal: { available: false, reason: PORTAL_NOT_OWNER_REASON },
        })}
      />
    );
    expect(out).not.toContain("<form");
    expect(out).toContain('data-testid="portal-unavailable"');
    expect(out).toContain("Only the workspace owner can open the Customer Portal");
  });

  it("OWNER TWIN: the owner of a workspace WITH a Stripe customer gets the live form", () => {
    const out = html(
      <UsageView {...usageProps({ portal: { available: true, action: "/portal" } })} />
    );
    expect(out).toContain('action="/portal"');
    expect(out).not.toContain('data-testid="portal-unavailable"');
  });

  it("the two reasons are DIFFERENT strings — a viewer is not told the workspace has no billing account", () => {
    expect(PORTAL_NOT_OWNER_REASON).not.toBe(NO_BILLING_ACCOUNT_REASON);
    expect(NO_BILLING_ACCOUNT_REASON).not.toContain("owner");
  });

  it("THE PAGE'S OWN DECISION, all four combinations (the wiring, not just the view)", () => {
    // The page component is executed by no test in this repo, so the decision
    // was extracted to a pure function rather than left as an inline ternary
    // nothing could assert — which is exactly how the role test went missing.
    expect(
      portalAvailability({ isOwner: true, hasStripeCustomer: true })
    ).toEqual({ ok: true });
    expect(
      portalAvailability({ isOwner: false, hasStripeCustomer: true })
    ).toEqual({ ok: false, reason: PORTAL_NOT_OWNER_REASON });
    expect(
      portalAvailability({ isOwner: true, hasStripeCustomer: false })
    ).toEqual({ ok: false, reason: NO_BILLING_ACCOUNT_REASON });
    // Role first: a viewer is told the ROLE rule, not offered a billing-account
    // remedy they could not act on either.
    expect(
      portalAvailability({ isOwner: false, hasStripeCustomer: false })
    ).toEqual({ ok: false, reason: PORTAL_NOT_OWNER_REASON });
  });

  it("END TO END through the view: a non-owner with a Stripe customer gets NO live form", () => {
    const decision = portalAvailability({
      isOwner: false,
      hasStripeCustomer: true,
    });
    const out = html(
      <UsageView
        {...usageProps({
          portal: decision.ok
            ? { available: true, action: "/portal" }
            : { available: false, reason: decision.reason },
        })}
      />
    );
    expect(out).not.toContain("<form");
    expect(out).toContain("Only the workspace owner");
  });
});

// ------------------------- the M2 workspace refusal has a rendered page now

describe("WorkspaceAccessError reaches a page (round-2 NOTE: withWorkspace was outside every try)", () => {
  it("renders the workspace_access copy — the branch that previously hit Next's default error page", () => {
    const out = html(
      <AccessRefusal copy={billingErrorDisplay(new WorkspaceAccessError("multi"))} />
    );
    expect(out).toContain('data-testid="workspace-access-error"');
    expect(out).toContain(BILLING_ERROR_COPY.workspace_access.title);
    expect(out).toContain("Nothing was modified");
    // The package message ("user belongs to multiple workspaces…") stays in the
    // log; the page shows the copy this layer owns.
    expect(out).not.toContain("multi");
  });
});

// -------------------------- ?saved= is a claim about an appended row (NOTE 1)

describe("admin /admin/config never fabricates a version number", () => {
  it("an EMPTY ?saved= does not render 'Saved as v0' (Number('') === 0, and 0 is an integer)", () => {
    expect(resolveSavedVersion("", 3)).toBeNull();
  });

  it("a version the active row does not support is refused (?saved=999)", () => {
    expect(resolveSavedVersion("999", 3)).toBeNull();
    expect(resolveSavedVersion("-1", 3)).toBeNull();
    expect(resolveSavedVersion("2.5", 3)).toBeNull();
    expect(resolveSavedVersion("abc", 3)).toBeNull();
    expect(resolveSavedVersion(["3"], 3)).toBeNull();
    expect(resolveSavedVersion(undefined, 3)).toBeNull();
    // ...and with no readable config there is no version to confirm against.
    expect(resolveSavedVersion("3", null)).toBeNull();
  });

  it("NON-VACUITY: the real post-save redirect still renders its banner", () => {
    expect(resolveSavedVersion("3", 3)).toBe(3);
    const out = html(
      <ConfigEditorForm
        active={{ ok: true, version: 3, json: "{}" }}
        state={{ status: "idle" }}
        action="/a/config"
        savedVersion={resolveSavedVersion("3", 3)}
      />
    );
    expect(out).toContain("v3");
  });

  it("the fail-closed copy the PAGE renders is the copy this suite asserts", () => {
    const out = html(
      <ConfigEditorForm
        active={{ ok: false, ...NO_ACTIVE_CONFIG_COPY }}
        state={{ status: "idle" }}
        action="/a/config"
        savedVersion={null}
      />
    );
    expect(out).toContain('data-testid="config-missing"');
    expect(out).toContain("pnpm db:seed");
    expect(NO_ACTIVE_CONFIG_COPY.detail).toContain("pnpm db:seed");
    expect(out).toContain("<textarea");
  });
});

// ------------------------------------------- honest empty states (REQ-G07)

describe("REQ-G07 empty states say WHY they are empty (non-negotiable 6)", () => {
  it("burn-by-mode and days-to-empty name the reason, and neither invents a number", () => {
    // THE REASON CHANGED IN SLICE 2a AND THIS ASSERTION CHANGED WITH IT. It
    // used to pin "generation arrives in a later milestone", which was the
    // honest reason in M1 and became false the moment the metered run started
    // spending credits. Pinned to the reason that is true now — the workspace
    // has spent nothing — which does not expire when the next spender ships.
    // The class is guarded in `tests/stale-disclosure.test.ts`.
    const out = html(<UsageView {...usageProps()} />);
    expect(out).toContain('data-testid="burn-by-mode"');
    // R7/R8 (slice 2b): the burn TOTAL now carries the "nothing spent" claim,
    // as a real answered zero from an unclamped query — not the by-mode
    // note, which no longer varies on spend state at all (see R9).
    expect(out).toContain('data-testid="burn-total"');
    expect(out).toContain("Nothing spent this month");
    // SLICE 6 REWROTE THIS SENTENCE TWICE, and both dead versions are pinned
    // as ABSENCES rather than deleted quietly. "exactly one thing spends
    // credits today" died when `GENERATION_PURPOSE` existed; "not split by
    // mode yet" died when R17a built the split. What survives both rewrites is
    // the claim R17a actually cares about: the numbers are real charges, never
    // an allocation of a cost total. `tests/usage-burn-by-mode.test.ts` is what
    // keeps the wording in step with the real purpose SET.
    expect(out).not.toContain("not split by mode yet");
    expect(out).toContain("Nothing here is estimated from the totals");
    expect(out).not.toContain("exactly one thing spends credits today");
    // An ANSWERED empty split says so; it does not fall back to a sentence
    // about a split the page cannot compute.
    expect(out).toContain('data-testid="burn-by-mode-empty"');
    expect(out).toContain('data-testid="days-to-empty"');
    expect(out).toContain("Not enough data");
  });

  it("an empty ledger explains what would put rows in it", () => {
    const out = html(<UsageView {...usageProps()} />);
    expect(out).toContain('data-testid="ledger-empty"');
    expect(out).toContain("No credit activity yet");
  });

  it("a populated ledger shows kind, delta, expiry, reference and date (REQ-G07 columns)", () => {
    const out = html(
      <UsageView
        {...usageProps({
          rows: [
            {
              id: "a", createdAt: new Date("2026-08-01T00:00:00Z"), kind: "grant",
              delta: 250, expiresAt: new Date("2026-10-01T00:00:00Z"), ref: "in_9",
            },
            {
              id: "b", createdAt: new Date("2026-08-05T00:00:00Z"), kind: "debit",
              delta: -5, expiresAt: null, ref: "gen_1",
            },
          ],
          moreRows: true,
        })}
      />
    );
    expect(out).toContain("2026-08-01");
    expect(out).toContain("+250");
    expect(out).toContain("-5");
    expect(out).toContain("in_9");
    expect(out).toContain("gen_1");
    expect(out).toContain("Showing the most recent 2 entries");
  });
});

// ------------------------------------- the error map is COMPLETE and CLEAN

describe("billing error copy: completeness and hygiene", () => {
  const errorClassNames = (mod: object): string[] =>
    Object.entries(mod)
      .filter(
        ([, v]) =>
          typeof v === "function" &&
          (v as { prototype?: unknown }).prototype instanceof Error
      )
      .map(([k]) => k);

  // @respin/db's error surface is ENUMERATED, not hand-typed (M2a task 12b).
  // It used to be the single literal `WorkspaceAccessError.name`, and that was
  // a live gap the moment `WorkspacePausedError` moved into @respin/db:
  // `facade-errors.test.ts` follows RELATIVE imports and so walks only
  // @respin/credits, and nothing enumerated @respin/db — so a refusal with no
  // copy would have degraded to "Something went wrong" with every suite green.
  //
  // The enumeration is over the whole root export, deliberately wider than the
  // eslint allowlist: a db error class that app/** cannot import yet is one a
  // later milestone will want to render, and being asked for copy when it is
  // ADDED is cheaper than discovering the gap from a creator.
  const facadeErrorNames = [
    ...errorClassNames(creditsFacade),
    ...errorClassNames(configFacade),
    ...errorClassNames(dbFacade),
  ];

  it("every Error class app/** can receive from a facade has copy here", () => {
    // Non-vacuity: the facades really do export a substantial error surface.
    expect(facadeErrorNames.length).toBeGreaterThan(10);
    const unhandled = facadeErrorNames.filter(
      (n) => !HANDLED_ERROR_CLASS_NAMES.includes(n)
    );
    expect(
      unhandled,
      "a facade error class has no copy — it would render as 'Something went wrong'"
    ).toEqual([]);
  });

  it("...and nothing is claimed that the facades do not export (no stale entries)", () => {
    const stale = HANDLED_ERROR_CLASS_NAMES.filter(
      (n) =>
        !facadeErrorNames.includes(n) && !APP_LOCAL_ERROR_CLASS_NAMES.includes(n)
    );
    expect(stale, "delete or correct a handler naming a class nobody exports").toEqual(
      []
    );
  });

  it("every code has copy, and every copy names something the reader can do", () => {
    for (const code of BILLING_ERROR_CODES) {
      const copy = BILLING_ERROR_COPY[code];
      expect(copy, code).toBeDefined();
      expect(copy.title.length, code).toBeGreaterThan(0);
      expect(copy.detail.length, code).toBeGreaterThan(30);
    }
  });

  it("copy NEVER carries ids from the underlying error (ids go to the log, remedy to the page)", () => {
    // The two classes whose package messages embed identifiers.
    const withIds = [
      new creditsFacade.LedgerIntegrityError(
        "row 0195aa11-2222-7333-8444-555566667777 over-consumes; lot 0195bb22-3333-7444-8555-666677778888"
      ),
      new creditsFacade.ClockSkewError(
        "at (2026-08-17T00:00:00.000Z) is more than 60s from the database clock (2026-08-17T10:00:00.000Z)"
      ),
    ];
    for (const err of withIds) {
      const copy = billingErrorDisplay(err);
      const rendered = `${copy.title} ${copy.detail}`;
      expect(rendered).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
      );
      expect(rendered).not.toContain("2026-08-17T");
      expect(rendered.length).toBeGreaterThan(30);
    }
  });

  it("CustomerMappingLostError's own message carries no ids either (round-11 NOTE)", () => {
    const message = new creditsFacade.CustomerMappingLostError().message;
    expect(message).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    expect(message).not.toMatch(/\bcus_[A-Za-z0-9]+/);
    expect(message).toContain("Nothing was charged");
  });

  it("NO billing copy sells a plan — every code, derived", () => {
    // THE SCAN THIS FILE WAS ALREADY CREDITED WITH AND DID NOT HAVE (billing
    // gate, 2026-09-01). `billing-errors.ts`'s slice-7 block said
    // "`tests/billing-ui.test.tsx` scans this whole map for the shape"; this
    // file contained no `upgrade` scan at all. The property held on the two
    // SCREENS — `tests/studio-ui.test.tsx` over `STUDIO_ERROR_CODES`,
    // `tests/framework-ui.test.tsx` over `FRAMEWORK_ERROR_CODES` — and nowhere
    // over the map itself, so a code with no screen-side override could say
    // "upgrade for this" with the suite green.
    //
    // THE PATTERN IS `/studio`'s, UNCHANGED, and the two honest exceptions are
    // NAMED rather than the pattern being narrowed to hide them: dropping
    // `\bsubscribe\b` would silence them and every future misuse of the word
    // together, which is the shape of every population defect in this repo.
    const SELLS_A_PLAN =
      /\bupgrad|move to a (higher |paid )?plan|a plan that includes|\bsubscribe\b/;
    const offenders = (BILLING_ERROR_CODES as readonly string[]).filter((code) => {
      const copy = BILLING_ERROR_COPY[code as BillingErrorCode];
      return SELLS_A_PLAN.test(`${copy.title} ${copy.detail}`.toLowerCase());
    });
    // `no_stripe_customer` — "a billing account is created the first time you
    // subscribe" — and `no_live_subscription` — "a cancelled subscription
    // cannot be reused, subscribe again" — are about HAVING a subscription at
    // all, on the billing surface, where subscribing IS the remedy. Neither
    // names another plan or its contents, which is what R15 forbids. A third
    // entry here is a judgement somebody has to make, and that is the point.
    expect(offenders, "a billing refusal sells a plan").toEqual([
      "no_stripe_customer",
      "no_live_subscription",
    ]);
    // NON-VACUITY: the pattern catches a planted violation of each clause.
    for (const planted of [
      "upgrading raises the number",
      "move to a higher plan to continue",
      "choose a plan that includes this mode",
      "subscribe to continue",
    ]) {
      expect(SELLS_A_PLAN.test(planted), planted).toBe(true);
    }
    // ...and it reads a population worth deriving.
    expect(BILLING_ERROR_CODES.length).toBeGreaterThan(20);
  });

  it("the counts these two docblocks assert are the counts the collection has", () => {
    // A COUNT IN PROSE IS BOUND TO NOTHING, WHICH IS WHY IT ROTTED TWICE
    // (billing gate rounds 1 and 2, 2026-09-01). `REVISION_PARENT_REFUSALS`'
    // docblock said "three" above four members; round 1 fixed it and left
    // `REVISION_PARENT_MESSAGES` twelve lines below saying "two of the three"
    // above the same four. The same shape was live in `@respin/llm`'s
    // `errors.ts` header ("TWO PARAMETERS ARE STRINGS", naming three), bound
    // there by `packages/llm/tests/no-text.test.ts`.
    //
    // THIS IS THE BINDING: the words are read out of the file and compared to
    // the real member count. It cannot pass vacuously — a reworded sentence
    // makes the match `null`, which is a failure, not a silence (CLAUDE.md,
    // 2026-08-21: a scan that finds nothing is indistinguishable from a scan
    // that is broken).
    const NUMBER_WORDS: Readonly<Record<number, string>> = {
      1: "one",
      2: "two",
      3: "three",
      4: "four",
      5: "five",
      6: "six",
    };
    const ORDINALS: Readonly<Record<number, string>> = {
      2: "second",
      3: "third",
      4: "fourth",
      5: "fifth",
      6: "sixth",
    };
    const n = Object.keys(REVISION_PARENT_REFUSALS).length;
    const source = readFileSync(
      join(HERE, "..", "packages", "credits", "src", "errors.ts"),
      "utf8"
    );
    // `REVISION_PARENT_REFUSALS`: "…FOUR MEMBERS…" — the round-1 correction.
    const members = /ABOVE (\w+) MEMBERS/.exec(source);
    expect(members, "the refusal docblock no longer states its size").not.toBeNull();
    expect(members?.[1].toLowerCase()).toBe(NUMBER_WORDS[n]);
    // `REVISION_PARENT_MESSAGES`: "three of the four … and the fourth …".
    const split = /(\w+) of the (\w+) are about what the product can do/.exec(
      source
    );
    expect(split, "the message docblock no longer splits the set").not.toBeNull();
    expect(split?.[1]).toBe(NUMBER_WORDS[n - 1]);
    expect(split?.[2]).toBe(NUMBER_WORDS[n]);
    const odd = /and the (\w+) is about ownership/.exec(source);
    expect(odd, "the message docblock no longer names the odd one out").not.toBeNull();
    expect(odd?.[1]).toBe(ORDINALS[n]);
  });

  it("EVERY `RevisionParentError` reason has its own code, and the `??` fallback is live", () => {
    // THE WITNESS `billing-errors.ts` NAMED AND THIS FILE DID NOT CARRY (billing
    // gate, 2026-09-01). Two comments there said this file "drives EVERY reason
    // the class can carry through `billingErrorCode`" and "drives [the `??`
    // fallback] with a cast-in reason". It did neither: `revision_parent`
    // appeared nowhere in this file.
    //
    // THE POPULATION IS `REVISION_PARENT_REFUSALS` ITSELF, so a fifth reason
    // added in the package reddens here rather than degrading to the neutral
    // fallback for a creator (CLAUDE.md, 2026-08-29).
    const reasons = Object.values(REVISION_PARENT_REFUSALS);
    expect(reasons.length).toBeGreaterThanOrEqual(4);
    const codes = reasons.map((reason) =>
      billingErrorCode(new creditsFacade.RevisionParentError(reason))
    );
    // FOUR REASONS, FOUR DIFFERENT SENTENCES — the whole reason the class gets
    // five codes. Telling a creator whose parent was an honest refusal that the
    // output "is not this creator's" sends them to look for a permissions
    // problem that does not exist.
    expect(new Set(codes).size, "two reasons share one code").toBe(reasons.length);
    for (const code of codes) {
      expect(code, "a reason fell through to the neutral fallback").not.toBe(
        "revision_parent"
      );
      expect(BILLING_ERROR_CODES as readonly string[]).toContain(code);
      expect(BILLING_ERROR_COPY[code].detail.length).toBeGreaterThan(30);
    }
    const details = codes.map((c) => BILLING_ERROR_COPY[c].detail);
    expect(new Set(details).size, "two reasons render one sentence").toBe(
      reasons.length
    );

    // THE `??` FALLBACK IS NOT DEAD CODE, and proving a field cannot be TYPED
    // is not proving it cannot be CAST (CLAUDE.md, 2026-08-21). `reason`
    // arrives on an object this build did not necessarily construct — a rolling
    // deploy runs two builds at once — so the branch is driven with a value the
    // type forbids.
    const fromAnotherBuild = new creditsFacade.RevisionParentError(
      "a_reason_this_build_has_never_heard_of" as never
    );
    expect(billingErrorCode(fromAnotherBuild)).toBe("revision_parent");
    // ...and the fallback CLAIMS NO CAUSE, which is why it is safe to land on:
    // unlike the run-slot pair there is no "the one that blames us" here.
    const fallback = BILLING_ERROR_COPY.revision_parent;
    expect(fallback.detail).toMatch(/nothing was (generated and nothing was )?spent/i);
    expect(fallback.detail.toLowerCase()).not.toMatch(
      /not this creator|another creator|your fault|permission/
    );
  });

  it("billingErrorCode maps a real instance to its code, and anything else to unknown", () => {
    expect(billingErrorCode(new creditsFacade.NotPausedError())).toBe("not_paused");
    expect(billingErrorCode(new creditsFacade.BillingRoleError("viewer"))).toBe(
      "not_owner"
    );
    expect(billingErrorCode(new WorkspaceAccessError("nope"))).toBe(
      "workspace_access"
    );
    expect(billingErrorCode(new Error("something else"))).toBe("unknown");
    expect(billingErrorCode(undefined)).toBe("unknown");
  });
});

// EVIDENCE-RUN FINDING 1: the page must TELL a paying creator their plan is
// ending. Before this, the only copy for that was behind `cancelAtPeriodEnd`,
// which the live Customer Portal never sets — and no test covered even that.
describe("scheduled end (evidence-run finding 1)", () => {
  const ENDS = new Date("2026-09-16T23:36:44.000Z");

  it("renders the DATE the subscription is scheduled to end", () => {
    const out = html(
      <BillingView
        {...billingProps({
          state: { tier: "creator", state: "active", cancelAt: ENDS },
        })}
      />
    );
    expect(out).toContain("data-testid=\"scheduled-cancel\"");
    expect(out).toContain("set to end on");
    // The date itself, not a vague "later" — we have it, so we print it.
    expect(out).toContain("2026-09-16");
    // And it is not a dead end: the copy says a new plan is possible after.
    expect(out).toContain("start a new plan afterwards");
  });

  it("NON-VACUITY: an ordinary active subscription shows no end notice", () => {
    const out = html(<BillingView {...billingProps()} />);
    expect(out).not.toContain("data-testid=\"scheduled-cancel\"");
    expect(out).not.toContain("set to end on");
  });

  it("a PAUSED subscription that is also scheduled to end says BOTH", () => {
    const out = html(
      <BillingView
        {...billingProps({
          state: {
            tier: "creator",
            state: "paused",
            resumesAt: new Date("2026-09-01T00:00:00.000Z"),
            cancelAt: ENDS,
          },
        })}
      />
    );
    expect(out).toContain("data-testid=\"paused\"");
    expect(out).toContain("data-testid=\"scheduled-cancel\"");
  });
});

// ================= audit 2026-08-17 remediation (R2) =================

describe("audit #8: an INCOMPLETE subscription gets its own state and a remedy that can work", () => {
  const incomplete = () =>
    billingProps({
      state: { tier: "free", state: "incomplete", pendingTier: "creator" },
      // `incomplete` counts as LIVE — that is the whole trap. The duplicate-
      // checkout guard is RIGHT to block a second plan here, so the fixture
      // carries the same liveness the page computes.
      hasLiveSubscription: true,
    });

  it("names the state, keeps the entitlement claim at Free, and says which plan is pending", () => {
    const out = html(<BillingView {...incomplete()} />);
    expect(out).toContain('data-testid="incomplete"');
    expect(out).toContain("first payment has not completed");
    expect(out).toContain("for the creator plan");
    // The ENTITLEMENT is Free and the page says so — no credits were granted.
    expect(out).toContain('data-testid="tier">free<');
    expect(out).toContain("stays on Free");
  });

  it("offers the hosted-invoice action and NOT the Customer Portal (which cannot resolve it)", () => {
    const out = html(<BillingView {...incomplete()} />);
    expect(out).toContain('data-testid="incomplete-recovery"');
    expect(out).toContain('data-testid="recover-invoice"');
    expect(out).toContain("/a/recover-invoice");
    // THE POINT OF THE FINDING: the Portal branch must not be what an
    // incomplete subscriber is sent to.
    expect(out).not.toContain('data-testid="manage-plan"');
    expect(out).not.toContain("/a/portal");
  });

  it("keeps the duplicate-checkout guard intact — no Subscribe button is offered", () => {
    const out = html(<BillingView {...incomplete()} />);
    expect(out).not.toContain('data-testid="subscribe"');
    expect(out).not.toContain('data-testid="subscribe-creator"');
    expect(out).toContain("would bill you twice");
  });

  it("the recovery action is OWNER-ONLY, with the reason associated with the control", () => {
    const out = html(
      <BillingView {...billingProps({ ...incomplete(), isOwner: false })} />
    );
    expect(out).toContain('aria-describedby="recover-invoice-reason"');
    expect(out).toContain('id="recover-invoice-reason"');
    expect(out).not.toContain("/a/recover-invoice");
  });

  it("NON-VACUITY: an ACTIVE subscription still gets the Portal, not the invoice remedy", () => {
    const out = html(<BillingView {...billingProps()} />);
    expect(out).toContain('data-testid="manage-plan"');
    expect(out).not.toContain('data-testid="incomplete-recovery"');
    expect(out).not.toContain('data-testid="incomplete"');
  });
});

describe("audit #1 (UI half): a PAUSED workspace is not offered a pack it would be refused", () => {
  const paused = () =>
    billingProps({
      state: {
        tier: "creator",
        state: "paused",
        resumesAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    });

  it("disables Buy pack and names the pause as the reason", () => {
    const out = html(<BillingView {...paused()} />);
    // The control is present but dimmed, with the reason linked to it.
    expect(out).toContain('data-testid="buy-pack"');
    expect(out).toContain('aria-describedby="buy-pack-reason"');
    expect(out).toContain('id="buy-pack-reason"');
    expect(out).toContain("a pause means no charges");
    // …and no form posts to the pack action at all.
    expect(out).not.toContain("/a/pack");
  });

  it("says the SAME thing the page's pause copy promises (no charges while paused)", () => {
    const out = html(<BillingView {...paused()} />);
    expect(out).toContain("frozen, not lost");
  });

  it("NON-VACUITY: an ACTIVE workspace can still buy a pack", () => {
    const out = html(<BillingView {...billingProps()} />);
    expect(out).toContain("/a/pack");
    expect(out).not.toContain('aria-describedby="buy-pack-reason"');
  });
});

describe("audit #17: every disabled billing control names its reason PROGRAMMATICALLY", () => {
  it("each disabled ActionButton links its button to its own reason id", () => {
    // A non-owner with no Stripe key: the widest set of disabled controls one
    // render can produce.
    const out = html(
      <BillingView
        {...billingProps({
          isOwner: false,
          stripe: { configured: false, remedy: PAGE_STRIPE_REMEDY },
        })}
      />
    );
    // Every `aria-describedby` this page emits must have a matching id, and
    // every disabled button must have one — asserted as a PAIR so neither half
    // can rot alone.
    const described = [...out.matchAll(/aria-describedby="([^"]+)"/g)].flatMap(
      (m) => m[1].split(" ")
    );
    expect(described.length).toBeGreaterThan(0);
    for (const id of described) {
      expect(out, `aria-describedby="${id}" must point at a real element`).toContain(
        `id="${id}"`
      );
    }
    const disabledButtons = [...out.matchAll(/<button[^>]*disabled[^>]*>/g)];
    expect(disabledButtons.length).toBeGreaterThan(0);
    for (const [tag] of disabledButtons) {
      expect(tag, "a disabled control must say WHY, to a screen reader too").toContain(
        "aria-describedby="
      );
    }
  });
});

describe("audit #26: the auto-top-up control explains WHEN it applies", () => {
  // THIS SUITE USED TO BE CALLED "...discloses that nothing can trigger it
  // yet", and that disclosure was accurate until slice 2a gave auto-top-up its
  // first caller: `runInference` asks `maybeAutoTopup` when a priced attempt
  // finds too small a balance. What must be described PROGRAMMATICALLY is the
  // same — the checkbox points at a paragraph that explains itself — but the
  // paragraph now says when the setting applies rather than that it cannot.
  it("carries the explanation, and the checkbox points at it", () => {
    const out = html(<BillingView {...billingProps()} />);
    expect(out).toContain('data-testid="auto-topup-unbuilt"');
    expect(out).toContain("needs more credits than you have");
    expect(out).not.toContain("Nothing can trigger this yet");
    expect(out).toContain('aria-describedby="auto-topup-unbuilt"');
    expect(out).toContain('id="auto-topup-unbuilt"');
  });

  it("with no live subscription the checkbox names BOTH reasons", () => {
    const out = html(
      <BillingView {...billingProps({ hasLiveSubscription: false })} />
    );
    expect(out).toContain(
      'aria-describedby="auto-topup-unbuilt auto-topup-blocked-reason"'
    );
    expect(out).toContain('id="auto-topup-blocked-reason"');
  });

  it("neither money screen still claims that only a generation spends credits", () => {
    // The PARITY this case was written for survives the copy change: the two
    // money screens must not disagree about what can spend a credit. What it
    // can no longer do is pin a shared sentence, because the shared sentence
    // was the false one. So it asserts the agreement negatively, on the claim
    // that actually went wrong, on both screens at once.
    const billing = html(<BillingView {...billingProps()} />);
    const usage = html(<UsageView {...usageProps()} />);
    for (const [label, out] of [
      ["billing", billing],
      ["usage", usage],
    ] as const) {
      expect(out, `${label} still claims only a generation spends`).not.toContain(
        "only a generation spends credits"
      );
      expect(out, `${label} still claims nothing can trigger a top-up`).not.toContain(
        "Nothing can trigger this yet"
      );
    }
  });
});

describe("the money screens never deny a spend the page can see (fix round, 2026-08-28)", () => {
  // THE DEFECT THESE PIN. `/usage` carried two hardcoded sentences —
  // "Nothing has been spent from this workspace yet" and "no credits have been
  // spent from this workspace yet" — with no reference to the ledger it renders
  // twenty lines below. Three gates found it independently. It is the same
  // class as the disclosure it replaced, which is why the fix is a function
  // over data rather than a better constant.

  it("spendVisibility: a visible debit is SPENT, whatever else is true", () => {
    expect(spendVisibility([{ delta: -50 }], false)).toBe("spent");
    expect(spendVisibility([{ delta: 100 }, { delta: -1 }], true)).toBe("spent");
  });

  it("spendVisibility: a CLAMPED page with no debit is UNKNOWN, never 'none'", () => {
    // The trap this exists for: `rows` is one page. An absent debit on page 1
    // is not evidence that nothing was ever spent, and reading it as such is
    // absence-as-zero — the error this repo has shipped twice.
    expect(spendVisibility([{ delta: 100 }], true)).toBe("unknown");
    expect(spendVisibility([], true)).toBe("unknown");
  });

  it("spendVisibility: only a COMPLETE page with no debit may say 'none'", () => {
    expect(spendVisibility([], false)).toBe("none");
    expect(spendVisibility([{ delta: 100 }], false)).toBe("none");
  });

  it("daysToEmptyNote never claims nothing was spent once a debit is visible", () => {
    const note = daysToEmptyNote("spent");
    expect(note).not.toMatch(/nothing has been spent/i);
    expect(note).not.toMatch(/no credits have been spent/i);
  });

  it("daysToEmptyNote does not claim completeness on a clamped page", () => {
    const note = daysToEmptyNote("unknown");
    expect(note).not.toMatch(/nothing has been spent from this workspace/i);
    // ...it scopes the claim to what is shown instead.
    expect(note).toMatch(/shown below/i);
  });

  it("burnByModeNote (R9, slice 2b) no longer varies by spend visibility — the burn TOTAL panel answers that now — and never claims a spend total itself", () => {
    const note = burnByModeNote();
    expect(note).not.toMatch(/nothing has been spent/i);
    expect(note).not.toMatch(/\d+ credits/i);
  });

  it("END TO END: a rendered debit row and a denial cannot coexist", () => {
    // The assertion the previous covering test could not make, because it
    // asserted the section renders and invents no number — both of which
    // stayed true while the sentence stopped being.
    const out = html(
      <UsageView
        {...usageProps({
          rows: [
            {
              id: "l1",
              kind: "debit",
              delta: -50,
              ref: "att-1",
              expiresAt: null,
              createdAt: new Date("2026-08-17T00:00:00Z"),
            },
          ],
        })}
      />
    );
    expect(out).toContain("-50");
    expect(out).not.toMatch(/Nothing has been spent from this workspace yet/i);
    expect(out).not.toMatch(/no credits have been spent from this workspace yet/i);
  });

  it("NON-VACUITY: a workspace the burn query genuinely answered as zero says so plainly (R7/R8, slice 2b — this claim moved from the by-mode note to the burn total, which is now the unclamped answer)", () => {
    const out = html(
      <UsageView
        {...usageProps({
          rows: [],
          moreRows: false,
          burn: { ok: true, hasAnyDebit: false },
        })}
      />
    );
    expect(out).toMatch(/Nothing spent this month/i);
  });

  it("a genuinely answered NON-ZERO burn renders the real number (billing gate round 2, 2026-08-29: previously untested — a mutation that always rendered 'Nothing spent' would have passed)", () => {
    const out = html(
      <UsageView
        {...usageProps({
          burn: { ok: true, hasAnyDebit: true, totalDebit: 137 },
        })}
      />
    );
    expect(out).toContain('data-testid="burn-total"');
    expect(out).toContain("137 credits spent this month");
    expect(out).not.toMatch(/Nothing spent this month/i);
  });

  it("a burn QUERY FAILURE renders the error state, distinct from a real zero (billing gate round 2, 2026-08-29)", () => {
    const out = html(<UsageView {...usageProps({ burn: { ok: false } })} />);
    expect(out).toContain('data-testid="burn-total-error"');
    expect(out).not.toContain('data-testid="burn-total"');
    expect(out).not.toMatch(/Nothing spent this month/i);
    expect(out).not.toMatch(/\d+ credits spent/i);
  });
});

describe("a refusal names what happened to the money (fix round, 2026-08-28)", () => {
  // Two paths told creators something false, and in both cases the class alone
  // could not carry the truth.

  it("a BILLABLE vendor failure is not told its included run survived", () => {
    // `refused` and `schema_invalid` are `true` in USAGE_OUTCOME_BILLABLE, so
    // the attempt consumes the included run. The single `llm_unavailable` copy
    // said the opposite, and the creator's next press costs full price.
    const billable = new LlmError("declined", "refused", true);
    expect(billingErrorCode(billable)).toBe("llm_attempt_recorded");
    const copy = BILLING_ERROR_COPY.llm_attempt_recorded;
    expect(`${copy.title} ${copy.detail}`.toLowerCase()).toMatch(/counted|used/);
    expect(copy.detail).not.toMatch(/your included (build|run) was not used/i);
  });

  it("...and a NON-billable one still says the included run survived", () => {
    // The direction that must not change: a 5xx costs the creator nothing.
    const notBillable = new LlmError("timed out", "unavailable", false);
    expect(billingErrorCode(notBillable)).toBe("llm_unavailable");
    expect(BILLING_ERROR_COPY.llm_unavailable.detail).toMatch(
      /included run was not used/i
    );
  });

  it("the vendor-failure copy no longer blames the creator's material", () => {
    // Nothing the creator typed is sent — the prompt is two fixed literals —
    // so telling them it "keeps happening on ordinary material" and that they
    // cannot fix it "by rewording" invited them to rewrite text that was never
    // transmitted.
    for (const code of ["llm_unavailable", "llm_attempt_recorded"] as const) {
      expect(BILLING_ERROR_COPY[code].detail).not.toMatch(/ordinary material/i);
    }
  });

  it("a debit refused AFTER the call does not claim nothing was called", () => {
    const err = new PostCallDebitError("att-1", 0, 50);
    expect(billingErrorCode(err)).toBe("debit_refused_after_call");
    const copy = BILLING_ERROR_COPY.debit_refused_after_call;
    expect(copy.detail).not.toMatch(/before anything was called/i);
    expect(copy.detail).toMatch(/answered/i);
    // ...and it still says the balance was untouched, which IS true.
    expect(copy.detail).toMatch(/nothing was taken/i);
  });

  it("the PRE-call refusal keeps its (true) claim that nothing was called", () => {
    // The two must stay distinguishable; collapsing them again is the defect.
    expect(billingErrorCode(new InsufficientCreditsError(0, 50))).toBe(
      "insufficient_credits"
    );
    expect(BILLING_ERROR_COPY.insufficient_credits.detail).toMatch(
      /before anything was called/i
    );
  });

  it("the payload-mismatch copy carries BOTH causes, like the error it renders", () => {
    // THE DEFECT (slice 7 cross-boundary pass, 2026-09-01). The screen said
    // "the request reused an id that belongs to another draft" — an accusation
    // — while `GenerationPayloadMismatchError`'s own message already named a
    // second cause it cannot tell apart: `hashRequest` gained a SIXTH field in
    // slice 7, so an attempt started by an EARLIER BUILD carries a hash taken
    // over five and cannot match however faithfully the creator resubmitted.
    // Telling a creator they submitted a different request when they did not
    // is the defect class this slice fixed twice already.
    //
    // DERIVED FROM THE PACKAGE'S MESSAGE, not pinned as a string: the class is
    // the authority on how many causes this refusal has, so a third cause
    // added there reddens here rather than leaving the screen a cause short.
    const err = new creditsFacade.GenerationPayloadMismatchError("att-1");
    expect(billingErrorCode(err)).toBe("generation_payload_mismatch");
    expect(
      err.message,
      "the ERROR stopped naming the pre-update cause — then this binding is backwards"
    ).toMatch(/before this product was last updated/i);

    const copy = BILLING_ERROR_COPY.generation_payload_mismatch;
    const text = `${copy.title} ${copy.detail}`;
    // The second cause reaches the screen...
    expect(text).toMatch(/before this product was last updated/i);
    // ...and the screen no longer asserts the first one as fact about the
    // creator, in the title or in the detail.
    expect(text).not.toMatch(/belongs to another draft/i);
    expect(text).not.toMatch(/already in use for a different draft/i);
    expect(text).not.toMatch(/\breused an id\b/i);
    // The money and the remedy are unchanged, and both are still true.
    expect(copy.detail).toMatch(/nothing was spent and no model was called/i);
    expect(copy.detail).toMatch(/start the draft again/i);
  });
});

describe("audit #16: the admin config error summary is reachable and tied to the field", () => {
  const rejected = (issues: { path: string; message: string }[]) => (
    <ConfigEditorForm
      active={{ ok: true, version: 2, json: "{}" }}
      state={{
        status: "error",
        message: "The configuration was not saved.",
        issues,
        draft: '{"broken": true}',
      }}
      action="/a/config"
      savedVersion={null}
    />
  );

  it("the issue list has an id and the textarea points at it", () => {
    const out = html(
      rejected([{ path: "pack.priceUsd", message: "Expected number" }])
    );
    expect(out).toContain('id="config-issues-list"');
    expect(out).toContain('aria-describedby="config-issues-list"');
    expect(out).toContain("pack.priceUsd");
  });

  it("the alert is FOCUSABLE, which is what lets focus move to it on rejection", () => {
    const out = html(rejected([{ path: "a", message: "b" }]));
    // `tabIndex={-1}` is the half of the fix that is visible in markup; the
    // effect that calls .focus() cannot run under static rendering, so what is
    // asserted here is that the target it focuses is focusable at all. Without
    // this attribute the effect would be a silent no-op.
    expect(out).toContain('data-testid="config-form-error"');
    expect(out).toContain('tabindex="-1"');
    expect(out).toContain('role="alert"');
  });

  it("the textarea is marked invalid so the state is not colour-only", () => {
    const out = html(rejected([{ path: "a", message: "b" }]));
    expect(out).toContain('aria-invalid="true"');
  });

  it("the label is bound to the textarea by id (it was a wrapping label before)", () => {
    const out = html(rejected([]));
    expect(out).toContain('for="config-content"');
    expect(out).toContain('id="config-content"');
  });

  it("NO dangling association when there are no issues to point at", () => {
    const out = html(rejected([]));
    expect(out).not.toContain("aria-describedby");
    expect(out).not.toContain('id="config-issues-list"');
    // …but the alert itself is still there and still focusable.
    expect(out).toContain('data-testid="config-form-error"');
    expect(out).toContain('tabindex="-1"');
  });

  it("NON-VACUITY: an idle form has no alert, no invalid flag and no description", () => {
    const out = html(
      <ConfigEditorForm
        active={{ ok: true, version: 2, json: "{}" }}
        state={{ status: "idle" }}
        action="/a/config"
        savedVersion={null}
      />
    );
    expect(out).not.toContain('data-testid="config-form-error"');
    expect(out).not.toContain("aria-invalid");
    expect(out).not.toContain("aria-describedby");
    // the field is still labelled, always
    expect(out).toContain('for="config-content"');
  });
});
