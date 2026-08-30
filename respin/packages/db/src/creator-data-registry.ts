// THE CREATOR-DATA REGISTRY (P9).
//
// One entry per table that holds, or is keyed to, creator data — each carrying
// an EXPORT decision, a DELETION decision, and the reason for both. REQ-A04
// gives a creator the right to take their data and the right to have it
// deleted, and neither right can be implemented against a set of tables nobody
// has enumerated.
//
// It is a SOURCE module rather than a list inside a test, deliberately: M2b's
// export and deletion paths must be able to READ it, so that adding a table
// and forgetting to export it is a compile-visible omission rather than a gap
// discovered by a creator.
//
// The completeness predicate is "every table created in migration 0011" — all
// six — and NOT "every table with an FK to creator_profiles". Those two differ
// by exactly one row: `workspace_spend_monthly`, which deliberately carries no
// FK so that it OUTLIVES the workspace it records. An FK-based predicate would
// have yielded five, and the one table it excluded is the one whose retention
// most needed a decision.

export type ExportDecision = {
  /** Does a REQ-A04 export include this table's rows? */
  included: boolean;
  reason: string;
};

export type DeletionDecision = {
  /**
   * cascade      — the rows go when the parent goes, by FK.
   * retained     — the rows deliberately survive; `reason` must say on what basis.
   * pseudonymised — retained, with identifiers replaced.
   */
  behaviour: "cascade" | "retained" | "pseudonymised";
  reason: string;
};

export type CreatorDataEntry = {
  table: string;
  /** Does this table hold creator-authored CONTENT (as opposed to metering)? */
  holdsCreatorContent: boolean;
  export: ExportDecision;
  deletion: DeletionDecision;
};

export const CREATOR_DATA_REGISTRY: readonly CreatorDataEntry[] = [
  {
    table: "creator_profiles",
    holdsCreatorContent: true,
    export: {
      included: true,
      reason:
        "the profile is the root of everything a creator would ask for; an export without it has no keys to hang the rest on",
    },
    deletion: {
      behaviour: "cascade",
      reason:
        "FK to workspaces ON DELETE CASCADE, and every profile-grained child cascades from here — so one workspace delete removes the whole tree",
    },
  },
  {
    table: "brain_docs",
    holdsCreatorContent: true,
    export: {
      included: true,
      reason:
        "the brain IS the creator's IP in this product (R-8: context, never weights). Withholding it would make the export worthless",
    },
    deletion: {
      behaviour: "cascade",
      reason: "composite FK to creator_profiles ON DELETE CASCADE",
    },
  },
  {
    table: "onboarding_inputs",
    holdsCreatorContent: true,
    export: {
      included: true,
      reason:
        "the creator's own submitted text, stored verbatim (normalised). It is also the corpus every source-evidence quote indexes, so an export without it makes the provenance in brain_docs unreadable",
    },
    deletion: {
      behaviour: "cascade",
      reason: "composite FK to creator_profiles ON DELETE CASCADE",
    },
  },
  {
    table: "model_usage",
    holdsCreatorContent: false,
    export: {
      included: false,
      reason:
        "metering only, and that is structural rather than a promise: usage_raw stores the vendor's usage object and NEVER prompt or completion text (schema comment + the P8 writer set, which is the one capability that fills it). What a creator can see of their own spend is the credit ledger, which the usage page already renders",
    },
    deletion: {
      behaviour: "cascade",
      reason:
        "composite FK ON DELETE CASCADE — chosen over `restrict`, which combined with the both-columns-NOT-NULL rule made deletion structurally IMPOSSIBLE (a profile with one usage row could never be deleted, and since profiles cascade from workspaces, workspace deletion would have failed too). The margin history that must survive is carried by workspace_spend_monthly instead",
    },
  },
  {
    table: "workspace_spend_monthly",
    holdsCreatorContent: false,
    export: {
      included: false,
      reason:
        "an operator-grained financial aggregate (workspace x month x tier). It contains no creator content and is not about a profile at all",
    },
    deletion: {
      behaviour: "retained",
      reason:
        "DELIBERATELY OUTLIVES the workspace — `workspace_id` is a plain column with NO foreign key, because a conventional FK would cascade away the very margin history this table exists to preserve. BASIS: business financial records, which are retained independently of a service-data deletion request. " +
        "PSEUDONYMISATION DECIDED (R-30.5 / R-54, 2026-08-29, slice 2b): at deletion time, `workspace_id` is replaced by ONE fresh random identifier per deleted workspace (every row that workspace accumulated moves to the SAME new id, so its own spend history stays internally groupable without being re-linkable to the real workspace), and the old-id-to-new-id mapping is discarded — no re-linkage path, by construction, since no column exists to write it to. `spend-rollup.ts`'s `pseudonymiseWorkspaceSpend` is the instrument; the deletion EXECUTOR that must call it is still six slices away (slice 10b), so `tests/retention.test.ts`'s sibling scan is the tripwire that keeps this from being a decision that only lives in this comment.",
    },
  },
  {
    table: "onboarding_interview_drafts",
    holdsCreatorContent: true,
    export: {
      included: true,
      reason:
        "the creator's own IN-PROGRESS interview answers, in their own words, before submission turns the decided ones into immutable creator_authored onboarding_inputs rows and brain-document claims (slice 3b). A draft holds real typed content the creator has not submitted yet, not a system artefact, so withholding it from the export would lose words they actually wrote",
    },
    deletion: {
      behaviour: "cascade",
      reason:
        "composite FK to creator_profiles ON DELETE CASCADE, the same shape onboarding_inputs and brain_docs already use for a profile-grained child",
    },
  },
  {
    table: "brain_activation_snapshots",
    holdsCreatorContent: false,
    export: {
      included: true,
      reason:
        "no text of its own — every column is a foreign id into brain_docs, which is already exported whole — but it is the only record of WHICH versions were coherently active together at each activation (slice 3b, R8/R9), and a creator asking what their brain looked like at a point in time is asking exactly this table. Cheap to include since it is ids only, and withholding structural history nobody asked to keep secret is the wrong default",
    },
    deletion: {
      behaviour: "cascade",
      reason:
        "composite FK to creator_profiles ON DELETE CASCADE, the same shape every other profile-grained child in this registry uses",
    },
  },
  {
    table: "frameworks",
    holdsCreatorContent: true,
    export: {
      included: true,
      reason:
        "PRIVATE rows (visibility='private') are creator-owned and belong in their export. SHARED rows (visibility='shared', both owner columns NULL by CHECK) are library content that belongs to nobody and is excluded — the same distinction R-9 draws, enforced by the two CHECK constraints rather than by the exporter remembering it",
    },
    deletion: {
      behaviour: "cascade",
      reason:
        "private rows cascade from creator_profiles. Shared rows have no owner to cascade from and are library content, so they are untouched — and the `shared implies both NULL` CHECK is what stops a private row BECOMING library content by losing its owner",
    },
  },
];

/** Lookup by SQL table name; undefined means "not registered", which is a bug. */
export function creatorDataEntry(
  table: string
): CreatorDataEntry | undefined {
  return CREATOR_DATA_REGISTRY.find((e) => e.table === table);
}

/**
 * Tables that hold no creator data of their own, each with the reason.
 *
 * THE PREDICATE THIS SERVES IS "every table any migration creates", not "every
 * table migration 0011 creates". The first version of the completeness test
 * read one migration prefix, so a creator-data table added in `0012_*` would
 * never have entered the check and the suite would have passed with no export
 * and no deletion decision — migrations are append-only NEW files, so the
 * prefix version only guarded a file nobody will edit again (tenancy gate
 * 2026-08-23).
 *
 * Widening the predicate means the pre-M2a tables need an answer too. They get
 * one here rather than an exemption: each is either infrastructure, or
 * workspace-grained data whose export and deletion M1 already settled through
 * the cascade enumeration in `packages/db/tests/db.test.ts`. Anything genuinely
 * creator-owned belongs in CREATOR_DATA_REGISTRY above, not here.
 */
export const NOT_CREATOR_DATA: Readonly<Record<string, string>> = {
  // Better Auth's own tables. Identity, not content — and `users.auth_user_id`
  // is the FK that keeps a domain row from outliving its identity.
  user: "Better Auth identity table; no product content",
  account: "Better Auth credential/provider links; no product content",
  session: "Better Auth sessions; transient, no product content",
  verification: "Better Auth verification tokens; transient",
  rate_limit: "sign-in limiter counters, keyed by client not by creator",
  // Domain infrastructure.
  users: "the domain identity row — deliberately carries NO email copy (D-M1-5)",
  workspaces: "the tenancy root itself; deletion of it is what triggers everything else",
  memberships: "who may reach a workspace; cascades from both sides (M1 AC-7)",
  config_versions: "install-wide runtime config; contains no workspace or creator data",
  // Billing. Workspace-grained, and M1 settled both rights: the cascade
  // enumeration in db.test.ts proves a workspace delete removes ledger,
  // subscription, pauses and attributed events.
  credit_ledger: "workspace billing history; export and deletion settled at M1 (REQ-G04)",
  subscriptions: "the Stripe mirror; cascades with the workspace (M1)",
  pause_periods: "pause record-keeping; cascades with the workspace (M1)",
  stripe_events:
    "raw Stripe payloads, retention governed by R-25/D-AUDIT-2 with its own no-new-reader tripwire in tests/retention.test.ts",
};
