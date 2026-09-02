// What `/studio/frameworks`' actions hand back to their buttons, and what the
// page hands its view (slice 7, R5b/R5c).
//
// A DIRECTIVE-FREE MODULE, for the reason `../run-state.ts` gives: a
// `"use server"` file may export only async functions, and a `"use client"`
// file is the wrong home for a contract the server owns.
//
// TYPE-ONLY IMPORT, and it must stay type-only: `../../billing-errors` reaches
// `@respin/credits/app-server` and therefore `pg`, so a VALUE import here would
// put a Postgres driver in the client bundle.
import type { BillingErrorCode } from "../../billing-errors";

/**
 * ONE FRAMEWORK AS THE SCREEN RENDERS IT.
 *
 * PROJECTED, NOT THE ROW. A `Framework` row carries `owner_profile_id`,
 * `workspace_id`, `curated_by`, `superseded_at` and the raw jsonb columns —
 * handing that object to a client component would ship a creator's scope
 * columns to the browser to render a name, and nothing would notice. Every
 * field below is one the screen actually prints.
 *
 * `visibility` TRAVELS, AND IT IS THE ANTI-MASQUERADE FIELD (R5c: "private rows
 * cannot masquerade as shared/curated rows"). The view renders the two lists
 * separately AND labels each row from this value, so a private row rendered in
 * the shared list would say `private` in its own badge — a defect the reader
 * can see rather than one only a query could find.
 */
export type FrameworkView = {
  id: string;
  name: string;
  slug: string;
  version: number;
  visibility: "shared" | "private";
  curatorStatus: string;
  confidence: string;
  saturation: string;
  /**
   * REQ-D02's warning, CARRIED FROM THE ROW rather than decided here.
   *
   * `SATURATION_NOTICE` is attached by `@respin/db`'s readers — "a warning that
   * every consumer has to reimplement is a warning one of them will omit" — so
   * this screen renders the value it was handed and holds no copy of it. `null`
   * means there is nothing to warn about.
   */
  saturationNotice: string | null;
  beats: string[];
  whyItConverts: string;
  applicability: { goal: string; niche: string; note: string }[];
  evidenceEntries: { kind: string; ref: string; observation: string }[];
  testedCaveats: string[];
  /** `true` once this row is recommendable — i.e. a draft may use it. */
  approved: boolean;
  retired: boolean;
};

/** What every write action hands back. */
export type FrameworkActionState =
  | { status: "idle" }
  | {
      /**
       * A WRITE LANDED. The name and version come from the RETURNED ROW, never
       * from the form: a creator is told what was stored, and on an edit the
       * version is the number the server minted rather than "the one after the
       * one this page was showing".
       */
      status: "saved";
      act: "created" | "edited" | "approved" | "retired";
      name: string;
      version: number;
    }
  | { status: "refused"; code: BillingErrorCode };

export const IDLE_FRAMEWORK_STATE: FrameworkActionState = { status: "idle" };
