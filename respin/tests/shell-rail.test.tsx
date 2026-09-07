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
import { describe, expect, it } from "vitest";
import { ShellRail } from "../app/(product)/shell-rail";

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
    expect(src).toContain("<ShellRail");
    expect(src).toMatch(/credits=\{credits\}/);
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
    credits = (await respinCredits.getBalance(workspace.id)).balance;
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
