// AUDIT P6-R6 AMENDMENT (register 2026-10-05 item 33, support half; decisions
// R-176, plan label R-159): EVERY CONTACT PROMISE RENDERS THROUGH THE ONE
// OPERATOR-SET ADDRESS, OR IS WITHDRAWN.
//
// THE POPULATION IS A LIST, NOT A PREDICATE (Respin rule 7). It was measured
// with `grep -rni "contact support" app packages/*/src --include=*.ts
// --include=*.tsx`: 21 lines in 5 files on 2026-10-05, the same 21 re-measured
// 2026-10-07 before this change. Each is listed below by the SITE that now
// renders it, and every assertion reads that list:
//
//   - the grep now finds nothing (the literal promise is gone everywhere);
//   - the two code lists the copy resolvers consult equal the measured codes,
//     both ways, so a code cannot be added or dropped silently;
//   - the modules that read the address, and the ones that word the sentence,
//     are exactly the ones listed, and no client module imports the reader;
//   - each site renders the address when one is set and promises nothing when
//     it is not.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrainVersionLimitError } from "@respin/db";
import {
  BILLING_ERROR_COPY,
  SUPPORT_CONTACT_CODES,
  billingErrorCopy,
  type BillingErrorCode,
} from "../app/(product)/billing-errors";
import { BRAIN_SUPPORT_CONTACT_CODES, brainErrorFor } from "../app/(product)/brain/copy";
import { studioErrorFor } from "../app/(product)/studio/copy";
import { SUPPORT_EMAIL_ENV, supportContact } from "../app/support-contact";
import {
  contactSentence,
  exportFailedText,
  unsettledChargeNote,
  withContact,
} from "../app/support-copy";
import { UsageView, type UsageViewProps } from "../app/(product)/usage/usage-view";
import { BURN_PERIOD_COPY } from "@respin/credits/app-server";
import { PRODUCTION_ROOTS, sourceFilesUnder } from "./support/source-files";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ADDRESS = "help@respin.example";

/**
 * THE MEASURED 21, by the site that renders each one now. `file` is the file
 * the grep found the line in; `site` is the code (for the two copy tables) or
 * the named sentence that replaced it.
 */
const MEASURED: readonly { file: string; site: string }[] = [
  ...[
    "ledger_integrity",
    "provenance",
    "brain_version_limit",
    "onboarding_input_limit",
    "auth_mail_refused",
    "scope_forgery",
    "usage_raw",
    "brain_schema_shape",
    "brain_claim_walk",
    "export_classification",
    "comparison_stratum",
    "comparison_input",
    "unknown",
  ].map((site) => ({ file: "app/(product)/billing-errors.ts", site })),
  ...[
    "brain_content_schema",
    "brain_kind_not_writable",
    "brain_claim_walk",
    "brain_reason",
    "onboarding_input_limit",
  ].map((site) => ({ file: "app/(product)/brain/copy.ts", site })),
  { file: "app/(product)/usage/usage-view.tsx", site: "unsettledChargeNote" },
  { file: "app/api/export/route.ts", site: "exportFailedText" },
  // The package message cannot know the address; it drops the phrase, keeps
  // its remedy (export the history), and the app layer's `brain_version_limit`
  // copy, listed above, carries the contact line.
  { file: "packages/db/src/errors.ts", site: "BrainVersionLimitError" },
];

/**
 * THE SECOND PREDICATE, measured 2026-10-07 with `grep -rniE "tell us"` over
 * `app` and every package's `src`: 34 lines in 7 files. The plan scoped R-176's population to
 * the 21 above and asked for both predicates to be recorded; the ones below
 * PROMISE contact in other words ("please tell us", "tell us if it keeps
 * happening") and are treated the same way, so "no screen promises contact
 * without a channel" holds for both. By site, as above.
 */
const MEASURED_TELL_US: readonly { file: string; site: string }[] = [
  ...[
    "autotopup_shortfall",
    "llm_attempt_recorded",
    "brain_pointer_divergence",
    "evidence_unreadable",
    "llm_truncated",
    "uncharged_attempt_cap",
    "input_too_large_frameworks",
    "generation_window_cost_cap",
    "llm_transport_refused",
    "unpriced_operation",
    "generation_uncharged_cost_cap",
    "generation_uncharged_attempt_cap",
    "reference_unusable",
    "generation_unusable",
    "kill_test_failed",
    "generation_lineage",
    "unknown_entitlement_tier",
    "refund_source_never_expires",
  ].map((site) => ({ file: "app/(product)/billing-errors.ts", site })),
  // `/studio`'s overrides of three of those codes, which carried their own ask.
  ...["llm_attempt_recorded", "llm_truncated", "uncharged_attempt_cap"].map((site) => ({
    file: "app/(product)/studio/copy.ts",
    site,
  })),
  // `/onboarding`'s three pre-vendor assembly sentences: client copy with no
  // address in reach, so the ask is withdrawn and nothing is appended.
  ...["no_fields_supplied", "duplicate_post", "duplicate_field_request"].map((site) => ({
    file: "app/(product)/onboarding/run-copy.ts",
    site,
  })),
  // Package messages: not rendered (screens show `billingErrorCopy`, never a
  // message), and the package cannot know the address, so the ask is dropped.
  ...["UnchargedAttemptCapError", "GenerationUnchargedAttemptCapError", "GenerationUnchargedCostCapError"].map(
    (site) => ({ file: "packages/credits/src/errors.ts", site })
  ),
  { file: "packages/llm/src/errors.ts", site: "LlmError(refused)" },
];

/**
 * The "tell us" lines that are NOT contact promises, each with why. A list
 * (Respin rule 7): a new line is red until it is either rewritten or listed.
 */
const TELL_US_NOT_A_PROMISE: readonly { file: string; text: string; why: string }[] = [
  { file: "app/(product)/billing-errors.ts", text: "Tell us what your videos are about first", why: "a form prompt: the remedy is the creator's one-line answer, on the page" },
  { file: "packages/credits/src/errors.ts", text: "tell us what your videos are about", why: "the same prompt in the refusal's message" },
  { file: "app/(product)/onboarding/interview/interview-view.tsx", text: "Tell us about {profileName}", why: "the interview's heading; the form below it is the channel" },
  { file: "app/(product)/onboarding/onboarding-view.tsx", text: "we record what you tell us", why: "describes the form the creator is filling in" },
];

const productionSources = () =>
  sourceFilesUnder(PRODUCTION_ROOTS).filter(({ file }) => !file.split("/").includes("tests"));

const sitesIn = (file: string) => MEASURED.filter((m) => m.file === file).map((m) => m.site);

describe("R-176: the support channel is one operator-set address, and every contact promise renders through it", () => {
  it("the measured population is 21 lines in 5 files", () => {
    expect(MEASURED).toHaveLength(21);
    expect(new Set(MEASURED.map((m) => m.file)).size).toBe(5);
  });

  it("no production source promises 'contact support' as a literal any more", () => {
    const hits = productionSources().flatMap(({ file, text }) =>
      text
        .split("\n")
        .map((line, i) => ({ file, line: i + 1, text: line }))
        .filter((l) => /contact support/i.test(l.text))
    );
    expect(hits.map((h) => `${h.file}:${h.line}`)).toEqual([]);
    // NON-VACUITY: the walk really read the files the promise used to live in.
    const read = new Set(productionSources().map((f) => f.file));
    for (const file of new Set(MEASURED.map((m) => m.file))) expect(read, file).toContain(file);
  });

  it("the second predicate: every 'tell us' line in code is rewritten or listed as not a promise", () => {
    const stripComments = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, (_m, before?: string) => (before === undefined ? " " : `${before} `));
    const hits = productionSources().flatMap(({ file, text }) =>
      stripComments(text)
        .split("\n")
        .filter((line) => /tell us/i.test(line))
        .map((line) => ({ file, line }))
    );
    const unexplained = hits.filter(
      (h) => !TELL_US_NOT_A_PROMISE.some((n) => n.file === h.file && h.line.includes(n.text))
    );
    expect(unexplained.map((h) => `${h.file}: ${h.line.trim().slice(0, 100)}`)).toEqual([]);
    // TWO-WAY: every listed non-promise is still there.
    for (const n of TELL_US_NOT_A_PROMISE) {
      expect(hits.some((h) => h.file === n.file && h.line.includes(n.text)), `${n.file}: ${n.text}`).toBe(true);
    }
    expect(MEASURED_TELL_US.length + TELL_US_NOT_A_PROMISE.length).toBeGreaterThan(25);
  });

  it("TWO-WAY: the codes the two resolvers append the contact line to ARE the measured codes", () => {
    const billingSites = [
      ...sitesIn("app/(product)/billing-errors.ts"),
      ...MEASURED_TELL_US.filter((m) => m.file === "app/(product)/billing-errors.ts").map((m) => m.site),
    ];
    expect([...SUPPORT_CONTACT_CODES].sort()).toEqual(billingSites.sort());
    expect([...BRAIN_SUPPORT_CONTACT_CODES].sort()).toEqual(sitesIn("app/(product)/brain/copy.ts").sort());
  });

  it("the address is read in ONE module, by the listed server modules only, and no client module imports it", () => {
    const files = productionSources();
    const namesVariable = files
      .filter(({ text }) => text.includes(`"${SUPPORT_EMAIL_ENV}"`) || text.includes(`process.env.${SUPPORT_EMAIL_ENV}`))
      .map((f) => f.file);
    expect(namesVariable).toEqual(["app/support-contact.ts"]);
    const importsOf = (module: string) =>
      files
        .filter(({ text }) => new RegExp(`from "[./]*${module}"`).test(text))
        .map((f) => f.file)
        .sort();
    expect(importsOf("support-contact")).toEqual(
      [
        "app/(product)/billing-errors.ts",
        "app/(product)/brain/copy.ts",
        "app/(product)/usage/page.tsx",
        "app/api/export/route.ts",
      ].sort()
    );
    expect(importsOf("support-copy")).toEqual(
      [
        "app/(product)/billing-errors.ts",
        "app/(product)/brain/copy.ts",
        "app/(product)/usage/usage-view.tsx",
        "app/api/export/route.ts",
      ].sort()
    );
    for (const file of importsOf("support-contact")) {
      const text = readFileSync(resolve(ROOT, file), "utf8");
      expect(/^\s*["']use client["']/m.test(text), `${file} is a client module`).toBe(false);
    }
    // The copy module reads no environment at all.
    expect(readFileSync(resolve(ROOT, "app/support-copy.ts"), "utf8")).not.toMatch(/process\.env|import /);
  });

  it("supportContact fails closed to NO channel on anything but one plain address", () => {
    expect(supportContact({})).toBeNull();
    expect(supportContact({ [SUPPORT_EMAIL_ENV]: "" })).toBeNull();
    expect(supportContact({ [SUPPORT_EMAIL_ENV]: "   " })).toBeNull();
    expect(supportContact({ [SUPPORT_EMAIL_ENV]: "support" })).toBeNull();
    expect(supportContact({ [SUPPORT_EMAIL_ENV]: "a@b" })).toBeNull();
    expect(supportContact({ [SUPPORT_EMAIL_ENV]: "<a@b.co>" })).toBeNull();
    expect(supportContact({ [SUPPORT_EMAIL_ENV]: "a@b.co, c@d.co" })).toBeNull();
    expect(supportContact({ [SUPPORT_EMAIL_ENV]: "a@b.co\nBcc: c@d.co" })).toBeNull();
    expect(supportContact({ [SUPPORT_EMAIL_ENV]: `${"a".repeat(250)}@b.co` })).toBeNull();
    expect(supportContact({ [SUPPORT_EMAIL_ENV]: `  ${ADDRESS} ` })).toBe(ADDRESS);
  });

  /** A promise of contact, in any wording these sites used or could use. */
  const PROMISE = /contact support|contact us|get in touch|reach (?:us|support)|email \S+@/i;

  it("UNSET: no measured site promises contact; SET: every one names the address", () => {
    const rendered = (support: string | null): Record<string, string> => ({
      ...Object.fromEntries(
        SUPPORT_CONTACT_CODES.map((code) => [`billing:${code}`, billingErrorCopy(code, support).detail])
      ),
      ...Object.fromEntries(
        BRAIN_SUPPORT_CONTACT_CODES.map((code) => [`brain:${code}`, brainErrorFor(code, support)!.detail])
      ),
      unsettledChargeNote: unsettledChargeNote(support),
      exportFailedText: exportFailedText(support),
    });
    const unset = rendered(null);
    const set = rendered(ADDRESS);
    // (13 + 18) + 5 + 2 sentences; the package messages are checked below.
    expect(Object.keys(unset)).toHaveLength(38);
    for (const [site, text] of Object.entries(unset)) {
      expect(text, site).not.toMatch(PROMISE);
      expect(text, site).not.toContain("@");
    }
    for (const [site, text] of Object.entries(set)) {
      expect(text, site).toContain(ADDRESS);
      expect(text, site).toMatch(PROMISE);
    }
    // ...and a code OUTSIDE the list never gains a contact line.
    const outside = (Object.keys(BILLING_ERROR_COPY) as BillingErrorCode[]).find(
      (code) => !SUPPORT_CONTACT_CODES.includes(code)
    )!;
    expect(billingErrorCopy(outside, ADDRESS)).toEqual(BILLING_ERROR_COPY[outside]);
  });

  it("/studio's overrides of a listed code carry the line too, read from the environment at the call", () => {
    const previous = process.env[SUPPORT_EMAIL_ENV];
    try {
      delete process.env[SUPPORT_EMAIL_ENV];
      for (const code of ["llm_attempt_recorded", "llm_truncated", "uncharged_attempt_cap"]) {
        expect(studioErrorFor(code)!.detail, code).not.toMatch(PROMISE);
      }
      process.env[SUPPORT_EMAIL_ENV] = ADDRESS;
      for (const code of ["llm_attempt_recorded", "llm_truncated", "uncharged_attempt_cap"]) {
        expect(studioErrorFor(code)!.detail, code).toContain(ADDRESS);
      }
    } finally {
      if (previous === undefined) delete process.env[SUPPORT_EMAIL_ENV];
      else process.env[SUPPORT_EMAIL_ENV] = previous;
    }
  });

  it("the package message dropped the phrase and kept its remedy; the app copy for it carries the line", () => {
    const message = new BrainVersionLimitError(200).message;
    expect(message).not.toMatch(PROMISE);
    expect(message).toMatch(/The export keeps the complete history/);
    expect(message).not.toMatch(/Export the history before/);
    expect(SUPPORT_CONTACT_CODES).toContain("brain_version_limit");
    expect(billingErrorCopy("brain_version_limit", ADDRESS).detail).toContain(ADDRESS);
  });

  it("/usage renders the address handed to it by the page, or no promise", () => {
    const AS_OF = new Date("2026-09-01T00:00:00.000Z");
    const props = (support: string | null): UsageViewProps => ({
      balance: { ok: true, value: 20, asOf: AS_OF },
      burn: { ok: true, hasAnyDebit: true, totalDebit: 9 },
      period: { start: AS_OF, ...BURN_PERIOD_COPY.calendar_month },
      burnByMode: {
        ok: true,
        byMode: [],
        notAGeneration: { credits: 0, debits: 0 },
        // A charge whose draft never settled: the one state that renders the note.
        nonTerminalClaim: { credits: 9, debits: 1 },
      },
      runway: {
        state: "estimate",
        asOf: AS_OF,
        windowStart: AS_OF,
        trailingWindowDays: 30,
        minimumDebitDays: 3,
        debitDayCount: 3,
        balance: 20,
        totalDebit: 9,
        dailyRate: 9 / 30,
        daysToEmpty: 66,
      },
      brainAssets: { state: "no_profile" },
      rows: [],
      moreRows: false,
      paused: null,
      portal: { available: false, reason: "No billing account yet." },
      error: null,
      billingHref: "/settings/billing",
      support,
    });
    const without = renderToStaticMarkup(<UsageView {...props(null)} />);
    const withAddress = renderToStaticMarkup(<UsageView {...props(ADDRESS)} />);
    expect(without).toContain('data-testid="burn-non-terminal-note"');
    expect(without).not.toMatch(PROMISE);
    expect(withAddress).toContain(ADDRESS);
  });

  it("the sentence helpers are total and add nothing when there is no channel", () => {
    expect(contactSentence(null)).toBe("");
    expect(withContact("Try again.", null)).toBe("Try again.");
    expect(withContact("Try again.", ADDRESS)).toBe(`Try again. If it keeps happening, email ${ADDRESS}.`);
  });
});
