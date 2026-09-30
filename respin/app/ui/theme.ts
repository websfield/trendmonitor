import { rethrowNextControlFlow } from "../../lib/next-control-flow";

export const THEME_KEY = "respin.theme.v1";
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
  return THEMES.some((theme) => theme === value);
}

export function readTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return isTheme(value) ? value : "light";
}

const CHANGE_EVENT = "respin-theme-change";

export function setTheme(theme: Theme): void {
  if (!isTheme(theme)) return;
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    rethrowNextControlFlow(err);
    // Appearance still changes for this session when storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeTheme(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

// Static trusted constants only. The same bootstrap runs before paint in the
// production root and the fixture harness; no creator input enters this script.
export const themeBootstrap = `(()=>{let theme="light";try{const value=window.localStorage.getItem(${JSON.stringify(THEME_KEY)});if(${JSON.stringify(THEMES)}.includes(value))theme=value;}catch{}document.documentElement.dataset.theme=theme;})();`;
