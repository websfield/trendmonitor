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
  /**
   * Does this table hold CREATOR CONTENT — their own words, or the finished
   * work this product produced FOR them — as opposed to metering, navigation
   * or in-flight working state?
   *
   * NOT "authored by the creator", and the distinction is load-bearing rather
   * than pedantic (tenancy gate round 2, 2026-09-01). `brain_docs` is inferred
   * by the product and `generations` is written by it; both are `true`, because
   * what makes a row the creator's is that it is THEIRS TO TAKE, not whose
   * fingers typed it. An authorship test applied honestly would exclude both,
   * and this field is what forces them into the REQ-A04 export.
   *
   * IT IS A FORCING CONDITION ON THE EXPORT, NEVER A SYNONYM FOR IT.
   * `tests/creator-data-registry.test.ts` makes `true` here mandate
   * `export.included: true`; `false` decides nothing on its own, which is why
   * `brain_activation_snapshots` is `false` and exported anyway (ids only, kept
   * for structural history) while `workspace_spend_monthly` is `false` and not.
   *
   * The discriminator that puts a row on the FALSE side is therefore what the
   * row IS, not who wrote it: metering (`model_usage`), a financial aggregate
   * (`workspace_spend_monthly`), a navigation preference
   * (`membership_profile_selections`), pure structure
   * (`brain_activation_snapshots`), or unshown working state superseded by an
   * exported record (`generation_attempts` — see its entry).
   */
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
    table: "membership_profile_selections",
    holdsCreatorContent: false,
    export: {
      included: false,
      reason:
        "a mutable per-member navigation preference, not creator-authored content or brain history. Exporting its user_id through a profile export would disclose workspace membership identity without adding creator IP",
    },
    deletion: {
      behaviour: "cascade",
      reason:
        "the composite membership FK and composite creator-profile FK both use ON DELETE CASCADE, so deleting either the membership or the selected profile removes the preference without a retained identifier",
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
    table: "generations",
    holdsCreatorContent: true,
    export: {
      included: true,
      reason:
        "the script, hooks and caption the product wrote FOR this creator, plus the kill-test verdict and the weakest point stated about it. This is the artefact they came here to make — an export that returns their brain but not what it produced returns the recipe and withholds the meal. It also carries the only record of WHICH coherent brain version each output ran under (brain_activation_id), so it is what makes their own history legible to them",
    },
    deletion: {
      behaviour: "cascade",
      reason:
        "composite FK to creator_profiles ON DELETE CASCADE, the same shape every other profile-grained child in this registry uses. The generation cascades with the profile even though the SPEND it caused does not: model_usage's own row cascades too and workspace_spend_monthly keeps the money history, so deleting a creator's outputs never costs us the financial record and never keeps their words",
    },
  },
  {
    table: "generation_attempts",
    // FALSE, and since R14c added `candidate` (2026-08-31) that is a judgement
    // rather than an observation, so it is written down. The warrant is UNSHOWN,
    // SUPERSEDABLE WORKING STATE: the candidate is an in-flight draft of a
    // document the creator has never been shown, which the kill test or the
    // balance may still refuse, and which the settled `generations` row
    // supersedes the moment it exists. The creator's record of this generation
    // is that `generations` row plus the creator-authored `request` that
    // produced it, and BOTH are exported.
    //
    // NOT "IT IS NOT AUTHORED BY THE CREATOR", which is how R-67 recorded this
    // warrant and is narrowed here in the same gate's second round. Authorship
    // proves too much: `generations` is likewise written by the product — its
    // own reason says so, "the script, hooks and caption the product wrote FOR
    // this creator" — and it is `holdsCreatorContent: true` and exported. A
    // warrant that, applied consistently, would strip the creator of the
    // artefact they came here to make is the wrong warrant, whatever answer it
    // happens to reach here. `holdsCreatorContent`'s own docblock now states
    // the meaning this entry relies on. (`docs/initial/decisions.md` is
    // append-only, so R-67's sentence stands as written; this is the code it
    // describes, corrected.)
    //
    // WHAT NEITHER VERSION CLAIMS (billing + tenancy gates, 2026-09-01): that
    // the candidate is "provably transient". The equality bounds it to the
    // `vendor_complete` STATE, which is not the same as bounding it in TIME —
    // an attempt stranded at `vendor_complete` by a crash between the response
    // checkpoint and settlement keeps its candidate until something moves it,
    // and today nothing sweeps that state. The warrant above does not depend on
    // how long the row sits there. See R-67 for the stranded-row residual and
    // its revisit trigger.
    holdsCreatorContent: false,
    export: {
      included: false,
      reason:
        "the durable CLAIM: a payload sha256, a purpose, a mode, a state, four timestamps — and, while the attempt sits at `vendor_complete`, the `candidate` R14c added (2026-08-31). Excluded because it is OURS, not theirs: an in-flight draft the creator has never been shown, which the kill test or the balance may still refuse, is the product's working state and not the creator's record. The creator's record is the settled `generations` row that supersedes it, and that IS exported, along with the creator-authored `request` that produced both. `generation_attempts_candidate_iff_vendor_complete` is an equality, so no TERMINAL row can retain it — that bounds the candidate by STATE, and deliberately no longer claims to bound it in TIME, because a crash between the response checkpoint and settlement strands an attempt at `vendor_complete` and nothing sweeps that state yet (R-67). Everything else here is an operational record of whether a vendor call happened, which is our reliability story rather than their data",
    },
    deletion: {
      behaviour: "cascade",
      reason:
        "composite FK to creator_profiles ON DELETE CASCADE. Chosen over `retained` deliberately, and the asymmetry with workspace_spend_monthly is the reason worth stating: the margin rollup must outlive the workspace because it is a financial record, whereas an attempt claim is an idempotency token whose whole job ends at settlement — keeping it after the profile is gone would retain a per-creator activity timeline for no purpose anyone could name",
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
