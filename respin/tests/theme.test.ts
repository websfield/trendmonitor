import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY, isTheme, readTheme, setTheme, subscribeTheme, themeBootstrap } from "../app/ui/theme";
import { ThemeSwitch } from "../app/ui/theme-switch";
import { redirect } from "next/navigation";

afterEach(() => vi.unstubAllGlobals());

describe("appearance bootstrap", () => {
  it.each([["dark", "dark"], ["light", "light"], [null, "light"], ["system", "light"], ["DARK", "light"], ["<script>", "light"]])(
    "validates persisted %s before painting %s", (stored, expected) => {
      const root = { dataset: { theme: "light" } };
      const getItem = vi.fn(() => stored);
      runInNewContext(themeBootstrap, { document: { documentElement: root }, window: { localStorage: { getItem } } });
      expect(root.dataset.theme).toBe(expected);
      expect(getItem).toHaveBeenCalledExactlyOnceWith(THEME_KEY);
    },
  );
  it("defaults to light when acquiring storage itself throws", () => {
    const root = { dataset: {} };
    const window = Object.defineProperty({}, "localStorage", { get() { throw Error("blocked"); } });
    runInNewContext(themeBootstrap, { document: { documentElement: root }, window });
    expect(root.dataset).toEqual({ theme: "light" });
  });
  it("rejects non-string and stale preferences", () => {
    for (const value of [undefined, null, {}, 1, "", "auto"]) expect(isTheme(value)).toBe(false);
  });
  it("runs the shared static bootstrap in the production head with a no-JS light default", () => {
    const src = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    expect(src).toContain('data-theme="light"');
    expect(src).toMatch(/<head>[\s\S]*__html: themeBootstrap[\s\S]*<\/head>[\s\S]*<body/);
  });
});

describe("session switching", () => {
  it("does not convert a real Next signal into a storage refusal", () => {
    vi.stubGlobal("document", { documentElement: { dataset: { theme: "light" } } });
    vi.stubGlobal("window", Object.assign(new EventTarget(), {
      localStorage: { setItem: () => redirect("/sign-in") },
    }));
    expect(() => setTheme("dark")).toThrow("NEXT_REDIRECT");
  });
  it.each([false, true])("updates only appearance and notifies subscribers when storage throws=%s", (blocked) => {
    const root = { dataset: { theme: "light", creatorProfile: "synthetic-profile" } };
    const setItem = vi.fn(() => { if (blocked) throw Error("blocked"); });
    const window = Object.assign(new EventTarget(), { localStorage: { setItem } });
    vi.stubGlobal("window", window);
    vi.stubGlobal("document", { documentElement: root });
    const changed = vi.fn();
    const stop = subscribeTheme(changed);
    setTheme("dark");
    expect(readTheme()).toBe("dark");
    expect(root.dataset.creatorProfile).toBe("synthetic-profile");
    expect(setItem).toHaveBeenCalledExactlyOnceWith(THEME_KEY, "dark");
    expect(changed).toHaveBeenCalledOnce();
    stop();
    setTheme("light");
    expect(changed).toHaveBeenCalledOnce();
  });
  it("server renders native non-submit buttons with named selected state", () => {
    const html = renderToStaticMarkup(createElement(ThemeSwitch));
    expect(html).toContain('aria-label="Appearance"');
    expect(html.match(/type="button"/g)).toHaveLength(2);
    expect(html).toContain('aria-pressed="true">Colour Pop');
    expect(html).toContain('aria-pressed="false">After Hours');
  });
});

describe("the icon sprite is a checked population, not an assumed one", () => {
  it("every ICONS symbol resolves in the served sprite", () => {
    const sprite = readFileSync(new URL("../public/illustrations/studio.svg", import.meta.url), "utf8");
    const source = readFileSync(new URL("../app/ui/icons.tsx", import.meta.url), "utf8");
    // The map is derived from the module's own source, so a name added later is
    // covered without anyone remembering (CLAUDE.md non-negotiable 7). A
    // dropped or renamed symbol otherwise renders an EMPTY <use>, silently:
    // `<use>` failing to resolve is not an error in any engine.
    const block = source.match(/const ICONS = \{([\s\S]*?)\} as const;/)?.[1] ?? "";
    // NOT `[a-z-]+`: that could not see a name carrying a digit or a capital,
    // so a sixteenth icon named e.g. `arrow-right-2` would go unchecked while
    // the floor below kept the test green (phase-1 gate batch 1).
    const symbols = [...block.matchAll(/:\s*"([^"]+)"/g)].map((match) => match[1]);
    expect(symbols.length, "the ICONS map must be readable from source").toBeGreaterThanOrEqual(15);
    const missing = symbols.filter((symbol) => !sprite.includes(`id="icon-${symbol}"`));
    expect(missing, "these icon names have no matching symbol in studio.svg").toEqual([]);
  });
});
