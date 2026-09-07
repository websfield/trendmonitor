// The shape the config editor's server action hands back to its form. Lives in
// its own directive-free module because a `"use server"` file may export only
// async functions, and a `"use client"` file is the wrong home for a contract
// the server owns.
export type ConfigIssueView = { path: string; message: string };

export type ConfigFormState = {
  status: "idle" | "error";
  /** What went wrong, in words the operator can act on. */
  message?: string;
  /** Field-level Zod issues, when the JSON parsed but the document did not. */
  issues?: ConfigIssueView[];
  /** The rejected input, echoed back so a long paste is never lost. */
  draft?: string;
};

export const IDLE_CONFIG_FORM_STATE: ConfigFormState = { status: "idle" };

/** Copy the PAGE renders when no config version parses — bound by a test. */
export const NO_ACTIVE_CONFIG_COPY = {
  title: "No usable configuration version",
  detail:
    "Either this database has never been seeded, or the newest version does not match the expected schema. Run `pnpm db:seed` to write version 1, or paste a complete valid document below and save it as a new version. Nothing is being defaulted meanwhile — every price and credit cost is refused until a version parses.",
} as const;

/**
 * "Saved as v<N>" is a claim about an APPENDED ROW, so it is only made when the
 * number in the URL is the version that is actually active.
 *
 * `Number("")` is `0` and `Number.isInteger(0)` is true, so a bare `?saved=`
 * rendered "Saved as **v0**. Earlier versions are untouched" for a save that
 * never happened, and `?saved=999` fabricated a version that does not exist —
 * an invented specific (non-negotiable 6) on the one page whose whole subject
 * is append-only provenance (round-2 NOTE 1).
 *
 * The cross-check is equality with the active version, not `<=`: a save
 * appends, and the row it appends becomes the active one. An older-but-real
 * version number is therefore still not evidence of THIS save, and the page
 * says nothing rather than something it cannot support.
 */
export function resolveSavedVersion(
  raw: string | string[] | undefined,
  activeVersion: number | null
): number | null {
  if (typeof raw !== "string" || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  if (activeVersion === null || n !== activeVersion) return null;
  return n;
}
