"use client";

// COPY SCRIPT, COPY MARKDOWN, DOWNLOAD MARKDOWN (launch L4, R-153).
//
// ALL IN THE BROWSER, from strings the server built from the saved version
// (`./recording-pack.ts`): no request is made, so copying or exporting cannot
// call a model or take a credit. The result of each press is announced in a
// PERSISTENT `role="status"` region (always rendered, L3 gate D-L1). When the
// browser refuses the clipboard, the status names the box that holds what the
// press was for — the script and the Markdown each have their own labelled,
// selectable box (accessibility C1).
//
// A REPEATED PRESS IS ANNOUNCED AGAIN (accessibility C2): setting a live
// region to the text it already holds changes nothing a screen reader hears,
// so `announce` clears the region first and sets the sentence again
// `ANNOUNCE_GAP_MS` later, which is a change the region reports. (Whether a
// given screen reader voices it is not verified here — R-133.)
import { useState } from "react";
import { buttonClass } from "../../../ui/button";
import {
  COPIED_PACK_STATUS,
  COPIED_SCRIPT_STATUS,
  COPY_PACK_FAILED_STATUS,
  COPY_PACK_LABEL,
  COPY_SCRIPT_FAILED_STATUS,
  COPY_SCRIPT_LABEL,
  DOWNLOAD_PACK_LABEL,
  DOWNLOADED_STATUS,
  PACK_TEXT_LABEL,
  SCRIPT_TEXT_LABEL,
} from "./saved-copy";

// Spacing from the `--sp-*` tokens (accessibility C5).
const control: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "var(--sp-2) var(--sp-4)",
  fontSize: "1rem",
};

const box: React.CSSProperties = { width: "100%", boxSizing: "border-box", fontSize: "0.85rem" };

/** How long the region stays empty before the sentence is set again, in ms. */
export const ANNOUNCE_GAP_MS = 50;

/**
 * CLEAR, THEN SET — so the same sentence twice in a row is two announcements.
 * Takes the setter and the scheduler so a test can watch the two writes.
 */
export function announce(
  set: (text: string) => void,
  text: string,
  schedule: (run: () => void, ms: number) => unknown = setTimeout
): void {
  set("");
  schedule(() => set(text), ANNOUNCE_GAP_MS);
}

export type PackActionsProps = {
  scriptText: string;
  markdown: string;
  fileName: string;
};

export function PackActions({ scriptText, markdown, fileName }: PackActionsProps) {
  const [status, setStatus] = useState("");

  // A PROMISE'S TWO BRANCHES, NOT A CATCH: a refused or missing clipboard is
  // a status line, never an error (no Next control flow can arise here).
  function copy(text: string, done: string, failed: string) {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard) {
      announce(setStatus, failed);
      return;
    }
    clipboard.writeText(text).then(
      () => announce(setStatus, done),
      () => announce(setStatus, failed)
    );
  }

  function download() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    announce(setStatus, DOWNLOADED_STATUS);
  }

  return (
    <div data-testid="saved-pack-actions">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
        <button
          type="button"
          className={buttonClass("primary")}
          style={control}
          data-testid="saved-copy-script"
          onClick={() => copy(scriptText, COPIED_SCRIPT_STATUS, COPY_SCRIPT_FAILED_STATUS)}
        >
          {COPY_SCRIPT_LABEL}
        </button>
        <button
          type="button"
          className={buttonClass("secondary")}
          style={control}
          data-testid="saved-copy-pack"
          onClick={() => copy(markdown, COPIED_PACK_STATUS, COPY_PACK_FAILED_STATUS)}
        >
          {COPY_PACK_LABEL}
        </button>
        <button
          type="button"
          className={buttonClass("secondary")}
          style={control}
          data-testid="saved-download-pack"
          onClick={download}
        >
          {DOWNLOAD_PACK_LABEL}
        </button>
      </div>
      <p role="status" aria-live="polite" data-testid="saved-pack-status" style={{ minHeight: "1.6em" }}>
        {status}
      </p>
      <label htmlFor="saved-script-text" className="label">
        {SCRIPT_TEXT_LABEL}
      </label>
      <textarea
        id="saved-script-text"
        data-testid="saved-script-text"
        readOnly
        value={scriptText}
        rows={6}
        className="mono"
        style={box}
      />
      <label htmlFor="saved-pack-text" className="label">
        {PACK_TEXT_LABEL}
      </label>
      <textarea
        id="saved-pack-text"
        data-testid="saved-pack-text"
        readOnly
        value={markdown}
        rows={8}
        className="mono"
        style={box}
      />
    </div>
  );
}
