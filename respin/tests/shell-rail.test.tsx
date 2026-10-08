// The product shell's credit rail — the refusal render, asserted.
//
// WHY THIS EXISTS: the Signal restyle put the derived balance into the
// sidebar, and the layout's comment claimed "on any refusal it shows nothing
// rather than a guess" with no test holding it (tenancy gate CHANGE,
// 2026-08-29 — the repo's twice-paid "a comment claiming a property is not
// the property" lesson). `ShellRail` is pure so a fixture can drive both
// branches; the layout's mapping of every caught failure to `null` is pinned
// as source, with a NON-VACUITY case proving the pin can fail.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShellRail } from "../app/(product)/shell-rail";
import { ProductNav } from "../app/(product)/nav";
import { ProductShell } from "../app/(product)/product-shell";
import { FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS } from "./support/forbidden-claims";
import { claimHits, specimensFor } from "./support/claim-scan";

// `useRouter` is here so `ProductShell` — which mounts `SignOutButton` — can be
// rendered. Without it the claims-canon sweep below could only reach three
// components by hand, which is exactly how its population went stale.
vi.mock("next/navigation", () => ({
  usePathname: () => "/studio/frameworks",
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

describe("reachable shell navigation", () => {
  it("preserves all native routes and identifies the active parent", () => {
    const html = renderToStaticMarkup(<ProductNav />);
    for (const href of ["/studio", "/trends", "/brain", "/results", "/onboarding", "/usage", "/settings/billing", "/settings/account"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toMatch(/href="\/studio"[^>]*aria-current="page"/);
    expect(html).toContain("<details");
    // The disclosure holds only its summary; the drawer it governs is the
    // details' SIBLING, so one copy of the secondary links and the shell foot
    // serves both breakpoints. `aria-controls` names what the summary actually
    // opens, because the implicit expanded state now refers to an empty
    // details (phase-1 gate; recorded for the manual screen-reader pass).
    expect(html).toMatch(/<summary aria-controls="shell-nav-drawer">/);
    expect(html).toContain('<div class="shell-nav-drawer" id="shell-nav-drawer">');
    expect(html).not.toContain('href="#"');
    // Exactly one of each: the duplicated-foot regression must fail here.
    expect(html.match(/id="shell-nav-drawer"/g)).toHaveLength(1);
    expect(html.match(/href="\/settings\/billing"/g)).toHaveLength(1);
  });
  it("the production shell wires its skip destination and appearance control", () => {
    // The MARKUP moved to product-shell.tsx so the browser fixture renders the
    // same component instead of a hand-copy (phase-1 gate M-7). The authority
    // chain stayed in layout.tsx and is pinned separately below.
    const src = repoFile("app/(product)/product-shell.tsx");
    expect(src).toContain('href="#main-content"');
    expect(src).toMatch(/<main id="main-content"[^>]*tabIndex=\{-1\}/);
    expect(src).toContain("<ThemeSwitch />");
    expect(src).toContain("<ShellRail");
    // ...and the fixture must render THAT component, not its own copy.
    const fixture = repoFile("e2e/visual/fixtures.tsx");
    expect(fixture).toContain("ProductShell");
    expect(fixture).not.toContain('className="shell-sidebar"');
  });
});

const repoFile = (rel: string): string =>
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "..", rel),
    "utf8"
  );

describe("ShellRail", () => {
  it("REFUSAL RENDER: credits null shows the workspace and NO credits element — never a guess", () => {
    const html = renderToStaticMarkup(
      <ShellRail workspaceName="Multi Workspace User" credits={null} />
    );
    expect(html).toContain("Multi Workspace User");
    expect(html).not.toContain("shell-credits");
    expect(html).not.toContain("credits");
  });

  it("a derived zero is a real balance, not a refusal — it renders", () => {
    const html = renderToStaticMarkup(
      <ShellRail workspaceName="W" credits={0} />
    );
    expect(html).toContain('data-testid="shell-credits"');
    expect(html).toContain("0 credits");
  });

  it("a positive balance renders as the mono credits line", () => {
    const html = renderToStaticMarkup(
      <ShellRail workspaceName="W" credits={250} />
    );
    expect(html).toContain("250 credits");
    expect(html).not.toContain("may change");
    expect(html).not.toContain("data-settling");
  });

  it("SETTLING (audit Phase 8, P8-R1): the committed fold renders WITH its indication, never as final", () => {
    const html = renderToStaticMarkup(
      <ShellRail workspaceName="W" credits={250} settling />
    );
    expect(html).toContain("250 credits (may change)");
    expect(html).toContain('data-settling="true"');
  });

  it("SETTLING is not a refusal, and a refusal stays the refusal render", () => {
    // Contention renders a number (settling); only a failed or refused read is null.
    const refused = renderToStaticMarkup(
      <ShellRail workspaceName="W" credits={null} settling />
    );
    expect(refused).not.toContain("shell-credits");
    expect(refused).not.toContain("may change");
  });
});

describe("the layout binds every failed balance read to the refusal render", () => {
  /**
   * The catch must re-throw Next control flow FIRST (action-gate rule), then
   * map to null — and nothing else may assign credits inside the catch. The
   * exclusivity is enforced by TEMPERED segments: `(?:(?!credits\b)[\s\S])`
   * forbids any other MENTION of `credits` between the anchors — plain
   * assignment, compound (`??=`, `+=`), or a read — so a fallback APPENDED
   * after the null-mapping reddens too (tenancy round-1 CHANGE + round-2
   * NOTE — the untempered version held presence and order, not exclusivity).
   */
  const NULL_MAPPING =
    /catch \(err\) \{(?:(?!credits\b)[\s\S]){0,400}?rethrowNextControlFlow\(err\);(?:(?!credits\b)[\s\S]){0,400}?credits = null;(?:(?!credits\b)[\s\S]){0,200}?\}/;

  it("the catch maps to null and the rail receives exactly that variable", () => {
    const src = repoFile("app/(product)/layout.tsx");
    expect(src).toMatch(NULL_MAPPING);
    // layout.tsx keeps every authority — requireUser, ensureUserWorkspace,
    // withWorkspace, getDisplayBalance and this refusal mapping — and hands the
    // result to the pure shell. The rail itself now lives in product-shell.
    expect(src).toContain("<ProductShell");
    expect(src).toMatch(/credits=\{credits\}/);
    expect(src).toContain("requireUser()");
  });

  it("NON-VACUITY: the pin catches a catch that substitutes a fallback value", () => {
    // The regression this guards: replacing the null-mapping with a read off
    // the unbranded bootstrap id, or any hardcoded fallback balance.
    const mutated = `catch (err) {
    rethrowNextControlFlow(err);
    credits = 0;
  }`;
    expect(NULL_MAPPING.test(mutated)).toBe(false);
  });

  it("NON-VACUITY: a fallback APPENDED after the null-mapping also reddens", () => {
    // The sloppy-edit shape the tenancy gate named: keep `credits = null;`
    // (so the untempered pin stayed green) and add a live fallback after it.
    const mutated = `catch (err) {
    rethrowNextControlFlow(err);
    credits = null;
    credits = (await respinCredits.getDisplayBalance(workspace.id)).balance;
  }`;
    expect(NULL_MAPPING.test(mutated)).toBe(false);
  });

  it("NON-VACUITY: a COMPOUND-assignment fallback reddens too", () => {
    // Tenancy round-2 NOTE: `credits ??= 0;` typechecks against
    // `number | null` and survived the `credits\s*=` lookahead.
    const mutated = `catch (err) {
    rethrowNextControlFlow(err);
    credits = null;
    credits ??= 0;
  }`;
    expect(NULL_MAPPING.test(mutated)).toBe(false);
  });
});

describe("the shell chrome is inside the shared claims canon (R23)", () => {
  // THIS SWEEP RAN THE CANON THROUGH ITS OWN LOOP UNTIL 2026-09-21, and it was
  // born that way IN THE SAME UNCOMMITTED CHANGE that added the one shared
  // predicate to stop exactly that (batch-5 compliance gate, C-1). P1-R4's
  // headline clause is "a fourth screen must not be able to re-invent the
  // idiom — the helper is the only exported way to run the canon", and this
  // file was the seventh. It was then listed in `PLANT_OWED` as a consumer
  // "owed a plant", which reads as a small gap and was not one: a private
  // `CANON` array plus a bare `.test()` is a re-invention, and it skipped the
  // `lastIndex` reset the shared predicate exists to guarantee.
  //
  // Nothing was live — no canon entry carries a flag today, which
  // `claim-scan.test.ts` pins from the tree — but "nothing is live" is a fact
  // about the tree, not a property of this code. `claimHits` is now the only
  // thing here that decides, and `specimensFor` is the plant.
  //
  // The shell is creator-facing copy the v2 redesign introduced, and the canon
  // had 18 per-screen consumers, none of them the shell. This is the shell's.
  //
  // The population is ONE render of the whole shell, not a hand-list of the
  // components someone remembered. The first version of this sweep rendered
  // ProductNav + ThemeSwitch + ShellRail and then hand-typed "Skip to content"
  // as a literal — and that literal was the tell: the one string that had to be
  // typed was the one the population could not reach. It also silently missed
  // Brand ("Respin"), SignOutButton ("Sign out") and every attribute string.
  // Rendering ProductShell reaches all of them transitively, so copy a later
  // phase adds to the shell is swept without anyone remembering to add it here
  // (CLAUDE.md non-negotiable rule 7 — a population is a list, not a producer).
  const shellHtml = renderToStaticMarkup(
    <ProductShell workspaceName="Alex's workspace" credits={250}>
      <h1>Synthetic page heading</h1>
    </ProductShell>
  );

  // Text nodes AND the attributes a creator can hear: aria-label, title, alt,
  // placeholder. A claim is a claim whether it is read or announced.
  const shellText = [
    ...[...shellHtml.matchAll(/>([^<>]+)</g)].map((match) => match[1]),
    // `value` included: a reviewer planted `<input type="submit"
    // value="Guaranteed to go viral" />` and it passed 38/38 while the same
    // claim in text or aria-label failed 4 cases. Announced is announced.
    ...[...shellHtml.matchAll(/(?:aria-label|title|alt|placeholder|value|aria-roledescription)="([^"]*)"/g)].map((match) => match[1]),
  ]
    .map((text) => text.trim())
    .filter((text) => text.length > 0);

  it("the sweep's population is ONE render of the whole shell, and it reaches every producer", () => {
    // Non-vacuity: an empty list would make every assertion below pass.
    expect(shellText.length).toBeGreaterThan(10);
    // The four the hand-list used to reach...
    expect(shellText).toEqual(expect.arrayContaining(["Studio", "References", "Brain", "Results", "More"]));
    // ...and the five it could not. These are the regression: if a future edit
    // narrows the population back to a component list, these disappear.
    expect(shellText).toEqual(expect.arrayContaining([
      "Skip to content",   // ProductShell's own copy, formerly hand-typed
      "Respin",            // Brand
      "Sign out",          // SignOutButton
      "Respin Studio",     // the wordmark's aria-label
      "Appearance",        // the theme switch's aria-label
    ]));
  });

  it("no shell string makes a claim the canon forbids", () => {
    for (const text of shellText) {
      expect(
        claimHits(text, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS),
        `shell copy ${JSON.stringify(text)}`
      ).toEqual([]);
    }
  });

  it.each(specimensFor(FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS))(
    "PLANTED: %s would be caught in a shell string",
    (label, specimen) => {
      // PER ENTRY, not one sentence covering several. A typo in one pattern
      // leaves that word sayable while a single planted sentence stays green
      // because some OTHER pattern matched it.
      expect(claimHits(specimen, FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)).toContain(label);
    }
  );

  it("NON-VACUITY: a planted claim in shell copy is caught by the shipped predicate", () => {
    expect(
      claimHits("Learns your voice and guarantees more views", FORBIDDEN_CLAIMS, PERFORMANCE_CLAIMS)
    ).toEqual(expect.arrayContaining(["learn", "guarantee", "more views"]));
  });
});

describe("BEHAVIOURAL: the refusal render survives the whole shell, not just the layout", () => {
  // Both batch-1 specialists planted the same two mutations and EVERY source
  // pin survived them, because extracting ProductShell split the credits chain
  // across two files: `credits={credits}` matches <ProductShell in layout.tsx,
  // while <ShellRail lives in product-shell.tsx where no pin mentions credits.
  //
  //   (a) `credits={credits ?? 0}` in product-shell.tsx  -> a GUESSED ZERO on
  //       the refusal path, which is the one thing shell-rail.tsx promises
  //       cannot happen.
  //   (b) re-adding a second {children} container in nav.tsx -> TWO
  //       shell-credits elements; the repaired guards pin duplicated ROUTES
  //       but never pinned a duplicated BALANCE.
  //
  // Source regexes cannot see either, so these render the real tree and count.
  const WORKSPACE = "Synthetic workspace";
  const render = (credits: number | null) =>
    renderToStaticMarkup(
      <ProductShell workspaceName={WORKSPACE} credits={credits}>
        <h1>Synthetic page heading</h1>
      </ProductShell>
    );
  // Counts the testid AND the rendered balance text: a reviewer planted a
  // second balance display WITHOUT the testid and the 0/250 cases stayed
  // green, because the population was a producer (one attribute) rather than
  // "any rendered balance" (CLAUDE.md non-negotiable 7).
  const occurrences = (html: string) => html.match(/data-testid="shell-credits"/g)?.length ?? 0;
  const balanceTexts = (html: string) => html.match(/\d[\d,]* credits/g)?.length ?? 0;

  it("credits null renders NO credits element anywhere in the shell", () => {
    const html = render(null);
    expect(occurrences(html)).toBe(0);
    expect(html).not.toContain("credits");
    // ...and the workspace identity still renders, so this is a refusal, not a
    // blank shell that would also satisfy the count above.
    expect(html).toContain(WORKSPACE);
  });

  it("a derived zero renders EXACTLY ONE credits element reading 0 credits", () => {
    const html = render(0);
    expect(occurrences(html)).toBe(1);
    expect(html).toContain("0 credits");
  });

  it("a positive balance renders EXACTLY ONE credits element", () => {
    expect(occurrences(render(250))).toBe(1);
    expect(render(250)).toContain("250 credits");
  });

  it("EXACTLY ONE rendered balance TEXT, whether or not it carries the testid", () => {
    expect(balanceTexts(render(250))).toBe(1);
    expect(balanceTexts(render(0))).toBe(1);
    expect(balanceTexts(render(null))).toBe(0);
  });

  it("EXACTLY ONE of every single-instance shell control IN THE SERVER-RENDERED MARKUP", () => {
    // The scope limit is in the name on purpose. `renderToStaticMarkup` never
    // runs effects, so a duplicate mounted in a `useEffect` is invisible here
    // BY CONSTRUCTION — a phase-1 reviewer planted exactly that and this file
    // plus page-wiring returned 63 passed while Chromium reported
    // `shell-credits resolved to 2 elements`. The browser counterpart is
    // `e2e/visual/visual.spec.ts`; this assertion covers SSR only.
    // The duplicate-foot regression in its general form: one workspace rail,
    // one appearance control, one sign-out, one billing link.
    const html = render(250);
    expect(html.match(/data-testid="shell-credits"/g)).toHaveLength(1);
    expect(html.match(/href="\/settings\/billing"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Appearance"/g)).toHaveLength(1);
    expect(html.match(/Sign out/g)).toHaveLength(1);
  });
});
