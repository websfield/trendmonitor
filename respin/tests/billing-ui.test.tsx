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
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as creditsFacade from "@respin/credits/app-server";
import * as configFacade from "@respin/config/app-server";
import { WorkspaceAccessError } from "@respin/db";
import {
  APP_LOCAL_ERROR_CLASS_NAMES,
  BILLING_ERROR_CODES,
  BILLING_ERROR_COPY,
  HANDLED_ERROR_CLASS_NAMES,
  billingErrorCode,
  billingErrorDisplay,
  billingErrorFromCode,
} from "../app/(product)/billing-errors";
import { UsageView, type UsageViewProps } from "../app/(product)/usage/usage-view";
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
    cancelAtPeriodEnd: false,
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
    const out = html(<UsageView {...usageProps()} />);
    expect(out).toContain('data-testid="burn-by-mode"');
    expect(out).toContain("generation arrives in a later milestone");
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

  const facadeErrorNames = [
    ...errorClassNames(creditsFacade),
    ...errorClassNames(configFacade),
    WorkspaceAccessError.name,
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
