import { test, expect, type Page } from "@playwright/test";
import { THEME_KEY } from "../../app/ui/theme";

// Explicit phase-1 surface/state coverage; later phases extend this table.
const surfaces = [
  { name: "shell", query: "surface=shell" },
  { name: "shell-zero", query: "surface=shell&balance=zero" },
  { name: "shell-unavailable", query: "surface=shell&balance=null" },
  { name: "shell-long", query: "surface=shell&long" },
  ...["landing", "women", "business", "coaches", "sign-in", "sign-up"].map((name) => ({ name, query: `surface=${name}` })),
];
const widths = [390, 768, 1024, 1440];

const ORIGIN = "http://127.0.0.1:8137";

/**
 * Records every request that leaves the fixture origin, and returns the list so
 * a test can assert on it.
 *
 * The first cut THREW inside the route handler. Playwright does not surface a
 * route-handler exception as a failure: the handler simply never calls
 * `continue()`, so the request hangs and the test dies on a 30 s timeout whose
 * message does not name the offending origin — and no test ever proved the
 * guard fires (phase-1 gate). Aborting names the origin and fails fast, and the
 * planted case below is the outside attempt to break it.
 */
async function installNetworkGuard(page: Page): Promise<string[]> {
  const offending: string[] = [];
  // Awaited: `void page.route(...)` made a rejection an unhandled rejection
  // rather than a test failure (phase-1 gate batch 1).
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) {
      offending.push(url.origin);
      return route.abort();
    }
    return route.continue();
  });
  return offending;
}

const guarded = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  guarded.set(page, await installNetworkGuard(page));
});

test.afterEach(async ({ page }) => {
  // NOT `?? []`. That made the one assertion whose job is to notice fail OPEN
  // whenever the guard had never been installed (phase-1 gate batch 1): an
  // absent entry silently became an empty offender list and passed.
  const offending = guarded.get(page);
  expect(offending, "the network guard was never installed on this page").toBeDefined();
  expect(
    offending,
    "the fixture must not reach any origin outside the loopback harness"
  ).toEqual([]);
});

test("PLANTED: the unexpected-network guard actually fires and names the origin", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const offending = await installNetworkGuard(page);
  await page.goto(ORIGIN + "/?surface=shell");
  await page.evaluate(() => fetch("https://example.invalid/beacon").catch(() => undefined));
  await expect.poll(() => offending).toEqual(["https://example.invalid"]);
  await context.close();
});

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function theme(page: Page, value: string) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: THEME_KEY, value });
}

for (const surface of surfaces) for (const mode of ["light", "dark"]) for (const width of widths) {
  test(`${surface.name} ${mode} ${width}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width, height: 900 });
    await theme(page, mode);
    await page.goto(`/?${surface.query}`);
    if (surface.name.startsWith("shell-") && width < 800) await page.locator("summary").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
    await page.evaluate(() => document.fonts.ready);
    await noOverflow(page);
    await expect(page.locator("h1")).toBeVisible();
    if (surface.name === "shell-zero") await expect(page.getByTestId("shell-credits")).toHaveText("0 credits");
    if (surface.name === "shell-unavailable") await expect(page.getByTestId("shell-credits")).toHaveCount(0);
    expect(errors).toEqual([]);
    const capture = info.outputPath("current-tree.png");
    // `animations: "disabled"` freezes CSS animation/transition FOR THE CAPTURE
    // only; the page itself keeps default motion, so the behavioural
    // assertions above still run against real motion. Without it, removing the
    // config's global reducedMotion left every full-page screenshot waiting on
    // the landing marquee (`28s linear infinite`): the three-engine matrix went
    // from 2.9 to 11.4 minutes and two Firefox captures died on the 30 s
    // timeout in teardown. Forcing reduced motion globally is what M-8 removed
    // and must not come back — this freezes the capture, not the page.
    await page.screenshot({ fullPage: true, path: capture, animations: "disabled" });
    await info.attach("current-tree", { path: capture, contentType: "image/png" });
  });
}

for (const mode of ["light", "dark"]) test(`rendered shell text contrast ${mode}`, async ({ page }) => {
  await theme(page, mode);
  await page.goto("/");
  const ratios = await page.evaluate(() => {
    function luminance(color: string) {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((n) => {
        const v = n / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    }
    return ["body", ".shell-workspace", ".shell-credits", '.nav-item[aria-current="page"]', '.theme-switch button[aria-pressed="true"]', "textarea"].map((selector) => {
      const element = document.querySelector(selector)!;
      let parent: Element | null = element;
      let background = "rgb(255, 255, 255)";
      while (parent) {
        const color = getComputedStyle(parent).backgroundColor;
        if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") { background = color; break; }
        parent = parent.parentElement;
      }
      const a = luminance(getComputedStyle(element).color), b = luminance(background);
      return { selector, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
  });
  for (const item of ratios) expect(item.ratio, item.selector).toBeGreaterThanOrEqual(4.5);
});

test("theme preserves mounted work, selection and native non-submit behavior", async ({ page }) => {
  await page.goto("/");
  const draft = page.getByLabel("Draft to preserve");
  await draft.fill("Keep this private draft in the mounted form.");
  await draft.evaluate((element: HTMLTextAreaElement) => {
    element.dataset.originalMount = "yes"; element.setSelectionRange(5, 11);
  });
  await page.getByRole("button", { name: "After Hours" }).click();
  await expect(draft).toHaveValue("Keep this private draft in the mounted form.");
  await expect(draft).toHaveAttribute("data-original-mount", "yes");
  expect(await draft.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([5, 11]);
  await expect(page.getByLabel("Fixture submissions")).toHaveText("0");
  await expect(page.getByRole("button", { name: "After Hours" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([[THEME_KEY, "dark"]]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("denied storage falls back and session switching still works", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "After Hours" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

// THE TAB-ORDER CLAIM, ON THE ENGINES THAT CAN CARRY IT.
//
// SPLIT OUT so the runner reports what actually ran (batch-3 gate, N-5).
// It used to live inside the test below behind `if (browserName === "webkit")
// await skip.focus()`, which made `expect(skip).toBeFocused()` a TAUTOLOGY on
// WebKit — the file said so in a comment while the run output counted it as a
// PASS. A diagnostic that reports "present" must distinguish present-and-
// VERIFIED from present-and-UNRUN (CLAUDE.md, 2026-08-10), and the only form
// of that a test runner understands is `skipped`.
//
// WHY WEBKIT CANNOT CARRY IT: its default keyboard mode moves Tab focus to NO
// anchor. Measured on this engine — eight consecutive presses cycle
// summary -> textarea -> button -> body and never reach a link, including all
// eight navigation links. That is Safari's "press Tab to highlight each item"
// default, inherited by Playwright's WebKit; it is not a defect in the skip
// link, which IS focusable there. WebKit automation does not certify Safari
// hardware either way.
for (const width of [320, 799, 800, 801]) test(`the skip link is the first Tab stop at ${width}`, async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit's default keyboard mode gives no anchor a Tab stop; this claim is uncovered there, not passing");
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/?long&balance=zero");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

for (const width of [320, 799, 800, 801]) test(`native navigation, focus and long identity at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/?long&balance=zero");
  await noOverflow(page);
  // The skip link's DESTINATION, which every engine can carry: focusing it and
  // pressing Enter must move focus into the main region. Whether Tab reaches
  // it in the first place is the engine-scoped test above.
  const skip = page.getByRole("link", { name: "Skip to content" });
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  if (width < 800) {
    await page.locator("summary").focus();
    await page.keyboard.press("Enter");
  }
  await expect(page.getByTestId("shell-credits")).toHaveText("0 credits");
  for (const href of ["/studio", "/trends", "/brain", "/results", "/onboarding", "/usage", "/settings/billing", "/settings/account"]) {
    const link = page.locator(`nav[aria-label="Product"] a[href="${href}"]`);
    await expect(link).toHaveCount(1);
    const rect = await link.boundingBox();
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(rect!.width).toBeGreaterThanOrEqual(44);
  }
});

for (const width of [390, 799]) test(`the More disclosure actually governs the drawer at ${width}`, async ({ page }) => {
  // The whole load-bearing property of the single-copy shell is one CSS line,
  // `.shell-nav-more:not([open]) ~ .shell-nav-drawer { display: none; }`, and
  // NOTHING asserted it (phase-1 gate batch 1). Delete that line and the
  // secondary links, workspace name, balance, appearance control and sign-out
  // render permanently open over the content at every width below 800px — with
  // 5,441 unit tests and 324 browser checks still green. A probe result
  // recorded in a comment is not the property; this is.
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/?balance=zero");
  const drawer = page.locator("#shell-nav-drawer");
  const summary = page.locator("summary");
  await expect(summary).toBeVisible();
  await expect(drawer, "closed: the drawer must be hidden").toBeHidden();
  await summary.click();
  await expect(drawer, "open: the drawer must be revealed").toBeVisible();
  await expect(page.getByTestId("shell-credits")).toBeVisible();
  await summary.click();
  await expect(drawer, "re-closed: the drawer must hide again").toBeHidden();
});

test("the drawer is in flow on desktop, where the disclosure is not used", async ({ page }) => {
  // The inverse case, so the assertion above cannot be satisfied by a rule that
  // simply hides the drawer everywhere.
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/?balance=zero");
  await expect(page.locator("summary")).toBeHidden();
  await expect(page.locator("#shell-nav-drawer")).toBeVisible();
  await expect(page.getByTestId("shell-credits")).toBeVisible();
});

test("reduced motion actually disables the decorative animations, and default motion keeps them", async ({ page }) => {
  // Both directions, deliberately. `reducedMotion: "reduce"` used to be set
  // globally in the config, so every capture rendered with animation disabled,
  // the landing animations were never exercised, and the reduced-motion test
  // re-emulated a mode already on — it had no contrast case and could not fail
  // (phase-1 gate). Removing the global setting fixed the captures but left
  // the behaviour itself asserted by nothing in either direction.
  // BOTH animation families, and both asserted. The first version computed a
  // `rising` value from ".hero-title, .marquee, .rise, [class*='rise']" and
  // never asserted it — and none of those selectors matches an animated
  // element: there is no `hero-title`/`rise` class in app/**, the `rise`
  // keyframe is applied by ELEMENT selectors, and `.marquee` carries no
  // animation (it is on `.marquee-track`). So a test named for "the decorative
  // animations" covered one family and computed a dead variable for the other.
  const durations = () => page.evaluate(() => {
    const read = (selector: string) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el).animationDuration : "absent";
    };
    return { track: read(".marquee-track"), rising: read(".hero h1") };
  });

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?surface=landing");
  const normal = await durations();
  expect(normal.track, "the marquee must exist on the landing fixture").not.toBe("absent");
  expect(normal.rising, "the hero rise animation must exist on the landing fixture").not.toBe("absent");
  expect(normal.track, "with default motion the marquee animates").not.toBe("0s");
  expect(normal.rising, "with default motion the hero rise animates").not.toBe("0s");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await durations();
  expect(reduced.track, "under reduced motion the marquee animation is disabled").toBe("0s");
  expect(reduced.rising, "under reduced motion the hero rise animation is disabled").toBe("0s");
});

test("unavailable balance is omitted", async ({ page }) => {
  await page.goto("/?balance=null");
  await expect(page.getByTestId("shell-credits")).toHaveCount(0);
});

test("server light and all native routes survive without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  // This page is created on its OWN context, which the beforeEach route was
  // never installed on — the network guard did not cover it at all (phase-1
  // gate). Install it here and assert it below, like every other test.
  const offending = await installNetworkGuard(page);
  await page.goto(ORIGIN + "/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator("summary").click();
  await expect(page.locator('a[href="/settings/account"]')).toBeVisible();
  await noOverflow(page);
  expect(offending, "the no-JS context must not reach outside the loopback harness").toEqual([]);
  await context.close();
});

test("forced colors, reduced motion and enlarged text preserve usable shell controls", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/?long");
  await page.addStyleTag({ content: "body{--fs-body:31px;--fs-ui:27px;--fs-meta:24px;--fs-h1:56px}" });
  await noOverflow(page);
  await page.locator("summary").click();
  await page.getByRole("button", { name: "Colour Pop" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "After Hours" })).toBeFocused();
  expect(await page.locator(":focus").evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

for (const mode of ["sign-in", "sign-up"]) for (const appearance of ["light", "dark"]) for (const width of widths) {
test(`${mode} ${appearance} ${width} pending, error and draft retention`, async ({ page }, info) => {
  let respond!: () => void;
  const released = new Promise<void>((resolve) => { respond = resolve; });
  await page.route("**/__auth", async (route) => {
    await released;
    await route.fulfill({ json: { error: { message: "Synthetic refusal: " + "Review the supplied account details. ".repeat(12) } } });
  });
  await page.setViewportSize({ width, height: 900 });
  await theme(page, appearance);
  await page.goto(`/?surface=${mode}`);
  if (mode === "sign-up") await page.getByLabel("Name", { exact: true }).fill("Synthetic creator");
  await page.getByLabel("Email", { exact: true }).fill("synthetic@example.test");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: mode === "sign-up" ? "Sign up" : "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Working…" })).toBeDisabled();
  await page.screenshot({ fullPage: true, path: info.outputPath("pending.png") });
  await page.getByRole("button", { name: appearance === "light" ? "After Hours" : "Colour Pop" }).click();
  respond();
  await expect(page.getByRole("alert")).toContainText("Synthetic refusal");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("synthetic@example.test");
  await noOverflow(page);
  await page.screenshot({ fullPage: true, path: info.outputPath("error-long.png") });
});
}

// ---------------------------------------------------------------------------
// READING ORDER — the automatable half of the owed manual screen-reader pass.
//
// WHAT THIS IS NOT, said first so nothing below is over-read. It is not an NVDA
// run and it never becomes one. Playwright drives a browser, never a screen
// reader: it cannot observe what NVDA speaks, how it maps `<summary>`, what its
// virtual buffer does on Enter, or whether what a creator hears is
// intelligible. The phase's owed **NVDA + Firefox** observation stands after
// every assertion here passes.
//
// WHAT IT IS. The least-confident probe named ONE concrete worry: "the summary
// governs a SIBLING, and the drawer follows the four primary links in DOM
// order." That worry is about the accessibility TREE, which is derived from the
// DOM and is exactly what a browser can be asked. So the concern splits into a
// part now measured on three engines and a part that still needs a person — and
// the first measurement already found something.
//
// WHAT IT FOUND (2026-09-20, first run). At 390 and 799 with the drawer open,
// the two orders DISAGREE:
//
//   tree:   More · Studio References Brain Results · Onboarding Usage Billing
//           Account · Colour Pop After Hours · Sign out
//   visual: More · Onboarding Usage Billing Account · Colour Pop After Hours ·
//           Sign out · Studio References Brain Results
//
// The four primary links are a fixed bottom bar at mobile, so a sighted user
// sees them LAST while a reader traverses them FIRST — and a reader who
// activates "More" walks all four before reaching the drawer that opened
// visually right above the control they just pressed.
//
// THIS IS RECORDED, NOT SILENTLY BLESSED AND NOT QUIETLY FIXED. Not fixed,
// because reordering the mobile shell changes the layout the design score was
// awarded on and no reviewer has seen this finding yet; not blessed, because a
// test that pins one order and calls it a pass hides the divergence behind a
// green tick. Both orders are asserted EXPLICITLY below, so any change to
// either is red, and the divergence itself is written down as the question the
// NVDA pass is being asked to rule on. WCAG 1.3.2 is the criterion; whether
// these two independent groups make the sequence meaning-changing is a
// judgement a person makes with a real reader, not one this file can make.
type Announced = { name: string; x: number; y: number };

/**
 * What a reader traverses, in order, inside `root`.
 *
 * THE PREMISE IS ASSERTED, NOT ASSUMED, and the first version asserted the
 * wrong two things (batch-3 gate, N-4). DOM order is accessibility-tree order
 * only while nothing reorders or removes nodes, and the ways that happens are
 * a LIST, not a pair someone recalled:
 *
 *   - `aria-owns` reparents. The first version looked for it among `root`'s
 *     DESCENDANTS, but it is declared on the REPARENTING element — the nav
 *     itself, or any element elsewhere in the document naming nav children —
 *     so both real shapes evaded it. It is checked document-wide now.
 *   - role-bearing `display: contents` drops the element from the tree.
 *   - `aria-hidden="true"` removes a VISIBLE element from the tree, which
 *     `isVisible()` cannot see.
 *   - an off-screen element (`left: -9999px`) is tree-present and visible to
 *     `isVisible()`, and its bogus coordinates scramble the visual sort.
 *
 * And the NAME is the accessible name, not `textContent`: `aria-label`,
 * `aria-labelledby` and `alt` all override it, and this shell contains
 * elements whose `textContent` is empty. `ariaSnapshot` is not used because it
 * carries no geometry, and geometry is half of what this test compares.
 */
async function announcedInTreeOrder(page: Page, root: string): Promise<Announced[]> {
  const items = page.locator(`${root} a, ${root} button, ${root} summary`);
  const out: Announced[] = [];
  for (const item of await items.all()) {
    if (!(await item.isVisible())) continue;
    // Not in the tree at all, however visible it looks.
    if (await item.evaluate((el) => el.closest('[aria-hidden="true"]') !== null)) continue;
    const box = (await item.boundingBox())!;
    const name = await item.evaluate((el) => {
      const labelled = el.getAttribute("aria-labelledby");
      const byId = labelled ? el.ownerDocument.getElementById(labelled)?.textContent : null;
      return (el.getAttribute("aria-label") ?? byId ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
    });
    out.push({ name, x: Math.round(box.x), y: Math.round(box.y) });
  }
  return out;
}

const PRIMARY_NAMES = ["Studio", "References", "Brain", "Results"];
const DRAWER_NAMES = ["Onboarding", "Usage", "Billing", "Account", "Colour Pop", "After Hours", "Sign out"];

for (const [width, openDrawer] of [[390, true], [799, true], [1024, false]] as const) {
test(`reading order and visual order in the product nav at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1200 });
  await page.goto("/?balance=zero");
  if (openDrawer) await page.locator("summary").click();
  const root = 'nav[aria-label="Product"]';

  // DOCUMENT-WIDE, because `aria-owns` lives on the reparenting element and
  // may sit anywhere — including on the nav itself, which a descendant
  // selector cannot see.
  expect(await page.locator("[aria-owns]").count(), "aria-owns anywhere in the document can reorder this nav's tree").toBe(0);
  expect(
    await page.locator(`${root} a, ${root} button, ${root} summary`).evaluateAll(
      (els) => els.filter((el) => getComputedStyle(el).display === "contents").length
    ),
    "display: contents on a role-bearing element drops it from the tree"
  ).toBe(0);

  const announced = await announcedInTreeOrder(page, root);
  // Every item has an accessible name and real coordinates. Without this an
  // icon-only control would join the list as `""` and the comparison below
  // would silently be about blanks.
  for (const item of announced) {
    expect(item.name, `a control in the nav has no accessible name at ${item.x},${item.y}`).not.toBe("");
    expect(item.x, `${item.name} is positioned off-screen; its coordinates cannot order it`).toBeGreaterThan(-1000);
  }

  const tree = announced.map((i) => i.name);
  const visual = [...announced].sort((a, b) => (a.y - b.y) || (a.x - b.x)).map((i) => i.name);

  if (openDrawer) {
    // MOBILE, DRAWER OPEN. Tree order is pinned outright: it is the sequence a
    // reader meets and it must not drift.
    expect(tree, "tree order: the disclosure, then the primary links, then the drawer").toEqual([
      "More", ...PRIMARY_NAMES, ...DRAWER_NAMES,
    ]);

    // VISUAL ORDER IS PINNED TO TWO NAMED STATES, and that is deliberate.
    //
    // The first version asserted `expect(tree).not.toEqual(visual)` — which
    // made the WCAG 1.3.2 divergence MANDATORY on three engines. Whoever fixed
    // A11Y-1, the open finding this block exists to record, would have turned
    // the suite red, with a message that read like the test was defending the
    // defect. The comment said "not blessed"; the code said "required"
    // (batch-3 gate, N-3).
    //
    // So both acceptable states are named: TODAY's divergence, and the FIXED
    // state where the two orders agree. Resolving A11Y-1 keeps this green;
    // any third order is a regression and is red.
    // Written as membership, not as a conditional `toEqual`. The first attempt
    // at this fix compared `visual` against `visual` in the fixed branch — a
    // tautology wearing a pass, which is the same defect one layer down.
    const DIVERGENT_TODAY = ["More", ...DRAWER_NAMES, ...PRIMARY_NAMES].join(" | ");
    const AGREES_WHEN_FIXED = tree.join(" | ");
    expect(DIVERGENT_TODAY, "the two accepted states must be distinct, or this assertion says nothing").not.toBe(AGREES_WHEN_FIXED);
    expect(
      [DIVERGENT_TODAY, AGREES_WHEN_FIXED],
      "visual order must be either today's known divergence (A11Y-1, open) or the fixed state where it matches tree order; a third order is a regression",
    ).toContain(visual.join(" | "));
  } else {
    // DESKTOP — one column, and here the two orders MUST agree. The contrast
    // case: without it the mobile expectation could be satisfied by a shell
    // whose orders never agree anywhere. `More` is absent because the
    // disclosure is hidden at this width, which is itself the point.
    expect(tree, "the disclosure is not used on desktop").toEqual([...PRIMARY_NAMES, ...DRAWER_NAMES]);
    expect(tree, "on desktop a reader and a sighted user must meet the same sequence").toEqual(visual);
  }
});
}

test("the More disclosure's controlled element exists, and the drawer leaves the tree when closed", async ({ page, browserName }) => {
  // THE EXACT TRADE THE PROBE NAMED, asserted rather than described. The drawer
  // is a SIBLING of the `<details>`, revealed by
  // `.shell-nav-more[open] ~ .shell-nav-drawer`, so the summary's expanded
  // state describes an EMPTY `<details>` while its `aria-controls` names the
  // drawer.
  //
  // `aria-expanded` IS NOT ASSERTED AS AN ATTRIBUTE, and the first draft of
  // this test did exactly that and failed: `toHaveAttribute("aria-expanded")`
  // read `null` on all three engines, because `<summary>`'s expanded state is
  // IMPLICIT — the browser computes it into the accessibility tree from
  // `details[open]` and never writes an attribute. A test asserting the
  // attribute would therefore have to be "fixed" by hard-coding one onto the
  // element, which would put a hand-maintained value beside the implicit one
  // and let the two disagree. So the source of truth, `details.open`, is what
  // is asserted, and the implicit exposure is named here as the thing only a
  // real reader can confirm.
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto("/?balance=zero");
  const details = page.locator("details.shell-nav-more");
  const summary = page.locator("summary");
  const drawer = page.locator("#shell-nav-drawer");
  await expect(summary).toHaveAttribute("aria-controls", "shell-nav-drawer");
  await expect(drawer, "aria-controls must name an element that exists").toHaveCount(1);

  expect(await details.evaluate((el: HTMLDetailsElement) => el.open)).toBe(false);
  await expect(drawer).toBeHidden();
  // `toBeHidden` accepts several mechanisms; the reader's question is narrower.
  // Off-screen is still traversable; `display: none` is not.
  expect(await drawer.evaluate((el) => getComputedStyle(el).display)).toBe("none");
  expect(await page.getByRole("link", { name: "Billing" }).count(), "a closed drawer must not be traversable").toBe(0);

  await summary.press("Enter");
  expect(await details.evaluate((el: HTMLDetailsElement) => el.open)).toBe(true);
  await expect(drawer).toBeVisible();
  expect(await page.getByRole("link", { name: "Billing" }).count()).toBe(1);

  // ...and the revealed content is reachable by keyboard FROM the control that
  // revealed it — the half a hidden-vs-visible assertion never covers. The
  // DISTANCE is the residual: four primary links sit between the summary and
  // the drawer, so it takes five presses, not one. Pinned, so shortening it is
  // a deliberate change and lengthening it is a regression.
  // ENGINE-SCOPED, for the reason this file already records at the native-
  // navigation test: WebKit's default keyboard mode moves Tab focus to NO
  // anchor at all, so there eight consecutive presses reach buttons only and
  // never a navigation link. Measured here too — WebKit returns
  // [Colour Pop, After Hours, Sign out, "", Save fixture draft]. That is
  // Safari's "press Tab to highlight each item" default inherited by
  // Playwright's WebKit, not a defect in the drawer, and WebKit automation
  // does not certify Safari hardware either way. Chromium and Firefox carry
  // the claim; WebKit is NOT covered for tab distance and says so.
  if (browserName === "webkit") {
    await page.keyboard.press("Tab");
    expect(
      ((await page.locator(":focus").textContent()) ?? "").trim(),
      "WebKit still reaches the drawer's first BUTTON, which is all this engine can show"
    ).toBe("Colour Pop");
    return;
  }
  const reached: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press("Tab");
    reached.push(((await page.locator(":focus").textContent()) ?? "").replace(/\s+/g, " ").trim());
  }
  expect(reached, "Tab from the summary walks the four primary links before entering the drawer").toEqual([
    ...PRIMARY_NAMES, "Onboarding",
  ]);
});
