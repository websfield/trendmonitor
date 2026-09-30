"use client";

import { useSyncExternalStore } from "react";
import { readTheme, setTheme, subscribeTheme } from "./theme";

export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light");
  return (
    <div className="theme-switch" role="group" aria-label="Appearance">
      <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>
        Colour Pop
      </button>
      <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>
        After Hours
      </button>
    </div>
  );
}
