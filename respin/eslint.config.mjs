// Respin's own ESLint config, pinned inside respin/ deliberately: a nested
// self-rooted project with "no config" silently inherits the enclosing repo's
// (CLAUDE.md lesson 2026-08-02). Nothing here references anything above respin/.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * The app-side default-deny rule value, built by ONE function so every
 * override cannot drift from the base (M1 phase 3 task 8b).
 * `adminSurface: true` additionally admits @respin/config/admin-server —
 * the global config WRITE entrypoint, admin routes only (tenancy round 2).
 * `webhookSurface: true` additionally admits @respin/credits/webhook-server —
 * the Stripe event dispatcher, `app/api/stripe/webhook/route.ts` EXACTLY
 * (narrowed from the subtree in phase-4 round 3: a nested helper could
 * otherwise re-export the SDK and a sibling could import the helper),
 * because dispatching an event is only legitimate BEHIND the signature check.
 */
const STRIPE_SDK_DENY =
  "app/** never constructs a Stripe client — every Stripe call goes through @respin/credits/app-server, which owns the lazy adapter, the pinned API version and the keyless refusal (AC-9). The ONE exception is app/api/stripe/webhook/route.ts EXACTLY, which needs the static Stripe.webhooks.constructEvent signature check (no API key, keyless-build safe); the grant is that single file, not the subtree, so a helper beside it cannot re-export the SDK.";

function appRestrictedImports({ adminSurface = false, webhookSurface = false } = {}) {
  return [
    "error",
    {
      paths: [
        {
          name: "@respin/db",
          allowImportNames: [
            "respinDb",
            "WorkspaceAccessError",
            // types only below
            "Db",
            "DbLike",
            "User",
            "Workspace",
            "Membership",
            "MembershipRole",
            "BootstrapParams",
            "BootstrapResult",
            "WorkspaceCtx",
            "WorkspaceScope",
            "VerifiedWorkspaceId",
            // M2a. The scope TYPES are importable; the VALUES are not, and
            // that is enforced by `export type` in @respin/db's index rather
            // than here — `allowImportNames` makes no type/value distinction,
            // measured (see AC-15). Deliberately ABSENT, so the default-deny
            // refuses them: writeCapabilities, assertScoped, VerifiedProfileId,
            // and every table object.
            "ProfileScope",
            // Error classes app/(product)/billing-errors.ts maps to copy. They
            // are inert values — catching a refusal is not reaching a query —
            // and the completeness suite enumerates this surface, so one added
            // to @respin/db without copy fails a test rather than degrading to
            // "Something went wrong".
            "WorkspacePausedError",
            "ProfileAccessError",
            "ProvenanceError",
            "BrainEditEmptyError",
            // SLICE 5, STAGE 2 (G3). The no-op edit refusal, split off
            // `ProvenanceError` so an unchanged-form submission stops
            // rendering the stale-page sentence. Another inert refusal
            // value `billing-errors.ts` maps to copy — the brain WRITE
            // surface stays absent and therefore still denied.
            "BrainEditUnchangedError",
            "BrainEditBusyError",
            "BrainEditLimitError",
            "BrainDocumentLimitError",
            "BrainVersionLimitError",
            "ExportBusyError",
            "OnboardingInputLimitError",
            "BRAIN_EDIT_MAX_FIELDS",
            "BRAIN_EDIT_POINTER_MAX",
            "BRAIN_EDIT_VALUE_MAX",
            "BRAIN_EDIT_TOTAL_MAX",
            "ExportClassificationError",
            "ScopeForgeryError",
            "UsageRawError",
            // M2b-1. Same rule as the five above: inert refusal values that
            // billing-errors.ts maps to copy. The brain WRITE surface
            // (writeBrainDoc, parseBrainContent, the schemas) stays absent, so
            // the default-deny still refuses it.
            "ContentSchemaError",
            "KindNotYetWritableError",
            "SchemaShapeError",
            "ClaimWalkError",
            "ContentWalkError",
            "BrainReasonError",
            "BrainRoleError",
            "SegmenterUnavailableError",
            // Slice 1. The four profile/intake refusals, same rule again:
            // inert values that `billing-errors.ts` maps to copy. The WRITE
            // surface stays absent, so the default-deny still refuses
            // `workspaceWriteCapabilities`, `writeCapabilities`, `assertScoped`
            // and every table object.
            "ProfileCapError",
            "ProfileNameError",
            "ProfileRoleError",
            "PostContentError",
            // Row TYPES the onboarding page renders. Type-only exports in
            // @respin/db's index, so a value import of either is TS1362 —
            // `allowImportNames` makes no type/value distinction, which is why
            // the distinction is enforced by `export type` there and not here
            // (AC-15, measured).
            "CreatorProfile",
            "OnboardingInput",
            // The two product LIMITS the onboarding copy states. Inert
            // numbers, not a write surface — and allowlisting them is the
            // point: the limit was hand-copied into four places (two form
            // attributes and two copy strings) with nothing binding them, so
            // moving a constant silently made the copy wrong (billing +
            // tenancy gate NOTEs, 2026-08-27). One source, asserted by
            // `tests/onboarding-ui.test.tsx`.
            "DISPLAY_NAME_MAX",
            "POST_CONTENT_MAX",
            "ONBOARDING_PAGE_MAX",
            // Slice 4. The reference-post ceiling, stated on the reference
            // panel the same way `POST_CONTENT_MAX` is stated on the paste
            // form — one source, never a hand-copied number.
            "REFERENCE_COUNT_MAX",
            // Slice 3. Two more inert refusal values that `billing-errors.ts`
            // maps to copy, added ONE BY ONE rather than by widening the rule:
            // `PostAttestationError` (R8's "you did not say you wrote this")
            // and `EvidenceUnreadableError` (a recorded quote that does not
            // read back from the post it names). The brain WRITE surface stays
            // absent — `writeCapabilities`, `confirmBrainDocFields` and
            // `activateBrainDoc` are still denied here, and the three brain
            // operations reach app/** only through `respinDb`.
            "PostAttestationError",
            "EvidenceUnreadableError",
            // Slice 4. The R-3 echo bar / quote-budget refusal — its own class,
            // separate from `ProvenanceError`, so `billing-errors.ts` can give
            // it copy that says a reference post was echoed rather than that a
            // quote didn't match the creator's own words (see the class's
            // docblock in @respin/db's errors.ts).
            "ReferenceEchoError",
            // The view TYPES the /brain screens render. Type-only, same rule
            // and same reason as `CreatorProfile` / `OnboardingInput` above: a
            // value import is TS1362 at the export, not here. RENAMED off
            // `Voice*` in slice 3b (Stage B2) — the same three types now
            // render `strategy` and `killtest` too, not only `voice`; see
            // `brain-ops.ts`'s docblock on `BrainClaimView`.
            "BrainDocsView",
            "BrainVersionView",
            "BrainClaimView",
            "PLACEHOLDER_ABSENCE",
            // Slice 2b (renamed /admin/margin -> /admin/model-spend in
            // slice 2b-c). The reconciliation view types, and the
            // `MonthlySpendResult` shape `/usage` renders — all type-only
            // (AC-15's `export type` rule again), so a value import is
            // TS1362 at the export, not here. The WRITE/query surface stays
            // absent: `monthlySpend`, `reconcileSpend`, `periodMonthUtc` and
            // `pseudonymiseWorkspaceSpend` reach app/** only through
            // `respinDb` (`monthlySpend`/`reconcileSpend` are its methods;
            // the other two are package-internal, never exported to app/**
            // at all).
            "SpendReconciliationResult",
            "SpendReconciliationRow",
            "SpendReconciliationClass",
            "UnbilledAttempt",
            "MonthlySpendResult",
            // Slice 3b, Stage B1. The interview surface's two typed refusals —
            // inert values `billing-errors.ts` maps to copy, the same rule as
            // every refusal class above. The two-plus write CAPABILITY reaches
            // app/** only through `respinDb.saveInterviewDraft` /
            // `.getInterviewDraft` / `.submitInterview`; the raw operations,
            // like `writeCapabilities` and `appendOwnPost`, stay denied here.
            "InterviewAnswerError",
            "InterviewDraftSubmittedError",
            // The interview field REGISTRY and its answer-shape TYPES — one
            // source the interview UI renders every question from, rather
            // than a hand-copied field list that could drift from
            // `interview-ops.ts`'s own vocabulary (the same reason
            // `POST_CONTENT_MAX` is allowlisted above). `INTERVIEW_FIELDS` is
            // a plain array of descriptors (key/kind/target/pointer/declinable)
            // — inert data, not a write surface.
            "INTERVIEW_FIELDS",
            "INTERVIEW_ANSWER_MAX",
            "InterviewAnswers",
            "InterviewFieldKey",
            "TextAnswer",
            "ListAnswer",
            "DirectionAnswer",
            "SubmitInterviewResult",
            // The row TYPE `respinDb.getInterviewDraft` returns — type-only,
            // same `export type` rule as `CreatorProfile`/`OnboardingInput`
            // above, so a value import is TS1362 at the export, not here.
            "OnboardingInterviewDraft",
            // The declared north-star metric's closed direction vocabulary —
            // the `metricDirection` field's two options, one source shared
            // with `brain-content.ts`'s own schema.
            "METRIC_DIRECTIONS",
            // SLICE 5, STAGE 2 (G0). The SHARED DISPLAY VOCABULARY the screen
            // and the downloaded file must both use — moved down into
            // `packages/db/src/export.ts` by stage 1 so `/brain` and
            // `openBrainExport` cannot say two different things about the same
            // field, and re-exported (never redeclared) by
            // `app/(product)/brain/copy.ts` and
            // `app/(product)/onboarding/interview/copy.ts`.
            //
            // ALL INERT: four `Record<string, string>` label maps, two absence
            // SENTENCES, four pure pointer->label functions, one pure
            // pointer predicate and one pure sentence builder. None of them
            // reads, writes or reaches a connection, which is why they can be
            // on this list at all — the brain WRITE surface
            // (`writeCapabilities`, `writeBrainDoc`, the tables) stays absent
            // and therefore still denied. `tests/shared-copy-identity.test.ts`
            // is what makes the re-export durable: it proves each name arrives
            // from @respin/db rather than as a second literal that can drift.
            "INTERVIEW_PLACEHOLDER_ABSENCE",
            // ROUND 2 (compliance CHANGE): the pure (kind, storedReason)
            // SELECTOR the two absence constants are two answers of. Inert
            // like the rest — it reads a closed table and returns a sentence,
            // reaching no connection — and it is what stops `/brain` telling a
            // creator "we could not point to a quote from your posts" about a
            // `[check]` they typed into their own edit.
            "screenAbsenceSentence",
            "VOICE_FIELD_LABELS",
            "STRATEGY_FIELD_LABELS",
            "STRATEGY_METRIC_FIELD_LABELS",
            "KILLTEST_FIELD_LABELS",
            "METRIC_DIRECTION_LABELS",
            "claimLabel",
            "strategyClaimLabel",
            "killtestClaimLabel",
            "isMetricPointer",
            "quoteIntro",
          ],
          message:
            "app/** may import only the sanctioned @respin/db surface (respinDb, WorkspaceAccessError, the typed refusals, types) — every query goes through withWorkspace, and the write capabilities are package-only (tenancy T1, M2a A-2b)",
        },
        {
          name: "@respin/auth",
          allowImportNames: [
            "getSessionUser",
            "requireUser",
            "requireAdmin",
            "authHandlers",
            "isGoogleConfigured",
            "adminAllowed",
            "parseAdminAllowlist",
            // types
            "SessionUser",
          ],
          message:
            "app/** may import only the sanctioned @respin/auth surface — createAuth/getAuth (the raw instance) stay package-only; client components use @respin/auth/client",
        },
        {
          name: "@respin/credits",
          message:
            "app/** never imports the raw @respin/credits root — use the wired facade @respin/credits/app-server (tenancy T1, M1 phase 3 task 8b)",
        },
        {
          name: "@respin/config",
          message:
            "app/** never imports the raw @respin/config root — use @respin/config/app-server (reads) or, from app/(admin) only, @respin/config/admin-server (writes)",
        },
        // The cage denied every DOMAIN route to Stripe and left the SDK itself
        // wide open (round-2 CHANGE 5). `stripe` is a direct dependency of the
        // app package, so `new Stripe(process.env.STRIPE_SECRET_KEY!)` in a
        // server action lint-passed, bypassed the adapter's pinned API version
        // and `isStripeConfigured()`'s keyless refusal, read the secret at the
        // page layer, and was invisible to the AC-9 "only getStripe constructs
        // a client" scan, which walks packages/credits/src only.
        //
        // `webhookSurface` re-admits it for the ONE file that needs the static
        // `Stripe.webhooks.constructEvent` signature check — that helper needs
        // no API key and is what makes the route trustworthy in the first place.
        ...(webhookSurface
          ? []
          : [
              {
                name: "stripe",
                message: STRIPE_SDK_DENY,
              },
            ]),
      ],
      patterns: [
        {
          // THE SPECIFIER-SHAPE HOLE (tenancy round 4 CHANGE). Every rule
          // above is anchored to a `@respin/…` package name, so all of them
          // were bypassable by spelling the same module as a path:
          //   import { createDb } from "@/packages/db/src/client"
          //   import { trustWorkspaceId } from "../../packages/db/src/with-workspace"
          // Both resolve (tsconfig maps `@/*` → `./*`), and neither is a
          // `@respin/*` specifier, so no rule fired. That reached the raw
          // connection, the non-session workspace-id mint, the raw tables, the
          // Stripe dispatcher and the admin config write — i.e. the whole cage.
          //
          // This is the 2026-08-02/07-30 lesson in one line: round 3 fixed the
          // FIELD (dynamic import of @respin names) and not the CLASS
          // (specifier shape). app/ and lib/ have no legitimate reason to
          // reach a package by path, so the deny is blanket.
          group: [
            "packages/*",
            "packages/**",
            "@/packages/*",
            "@/packages/**",
            "**/packages/*",
            "**/packages/**",
          ],
          message:
            "app/** and lib/** reach packages ONLY through their @respin/* package names, so the sanctioned-surface rules apply — a relative or @/-aliased path into packages/ bypasses every one of them (tenancy T1)",
        },
        {
          // Deep spellings of the same SDK (`stripe/lib/...`), denied even in
          // the webhook route: the sanctioned surface there is the package
          // root's static webhook helper, not its internals.
          group: ["stripe/*"],
          message: STRIPE_SDK_DENY,
        },
        {
          group: ["@respin/db/*"],
          message:
            "no deep imports into @respin/db from app/** — the package root's sanctioned surface is the only door (tenancy T1)",
        },
        {
          group: ["@respin/auth/*", "!@respin/auth/client"],
          message:
            "the only sanctioned deep import into @respin/auth is ./client (the browser entrypoint)",
        },
        {
          group: webhookSurface
            ? [
                "@respin/credits/*",
                "!@respin/credits/app-server",
                "!@respin/credits/webhook-server",
              ]
            : ["@respin/credits/*", "!@respin/credits/app-server"],
          message: webhookSurface
            ? "sanctioned @respin/credits entrypoints here: ./app-server (the wired facade) and ./webhook-server (the Stripe dispatcher, behind the signature check)"
            : "the only sanctioned deep import into @respin/credits is ./app-server (the wired facade) — ./webhook-server dispatches Stripe events and is app/api/stripe/** only",
        },
        {
          group: adminSurface
            ? [
                "@respin/config/*",
                "!@respin/config/app-server",
                "!@respin/config/admin-server",
              ]
            : ["@respin/config/*", "!@respin/config/app-server"],
          message: adminSurface
            ? "sanctioned @respin/config entrypoints here: ./app-server (reads) and ./admin-server (admin writes)"
            : "the only sanctioned @respin/config entrypoint outside app/(admin) is ./app-server — the WRITE surface (./admin-server) is admin-only",
        },
        {
          // THE NEGATION-FORM CATCH-ALL (brain-surface task 25).
          //
          // Every rule above is anchored to a package that EXISTS TODAY —
          // `paths` names @respin/db, /auth, /credits, /config one by one — so
          // the boundary was default-ALLOW for any package added later. The
          // finish plan creates four (`llm` in slice 2a, then `modes`,
          // `trends`, `brain`), and each would have landed outside the cage
          // silently with every fixture in `tests/import-boundary.test.ts`
          // still green: a guard that passes because it found no candidates is
          // the fail-open shape CLAUDE.md's 2026-08-21 lesson names.
          //
          // Inverted, so joining the boundary is a deliberate edit to THIS list
          // rather than something a new package inherits by omission.
          //
          // THE PATTERN LIST'S SHAPE IS MEASURED, NOT GUESSED, and the measurement
          // is the reason the package roots are negated here even though two of
          // them are denied one block up. `no-restricted-imports` matches with
          // the `ignore` package, i.e. GITIGNORE semantics — and gitignore
          // cannot re-include a child of an excluded parent. So
          // `["@respin/*", "!@respin/credits/app-server"]` excludes
          // `@respin/credits` as a "directory" and the negation is INERT: the
          // wired facade every product page imports goes dark. That was not a
          // hypothesis; it was six lint errors across billing-errors.ts, the
          // billing action, two pages and the webhook route on the first run of
          // this rule, and a probe against the installed engine is what
          // explained them.
          //
          // Hence: negate each package ROOT so it is not an excluded parent,
          // then negate each sanctioned deep entrypoint. The catch-all
          // therefore permits `@respin/credits` and `@respin/config` roots —
          // which stay denied by their NAMED `paths` entries above, where the
          // message can say what to import instead. This entry's job is the
          // class those entries cannot cover: a package nobody has written yet,
          // and a deep entrypoint nobody has sanctioned yet.
          //
          // ---- THE DECISIONS THIS LIST RECORDS BY OMISSION, WRITTEN DOWN.
          //
          // A package is "considered and denied" or "never looked at", and a
          // list that only names the ADMITTED cannot tell those apart. So each
          // package that arrives and STAYS DENIED says so here, once:
          //
          //   `@respin/llm`   (slice 2a) — denied. A server action that could
          //     build a prompt is a server action that can reach a model with
          //     arbitrary text; app/** reaches it through `inferVoice` on
          //     @respin/credits/app-server.
          //   `@respin/modes` (slice 6, stage B) — DENIED, deliberately, and
          //     it stays denied. It holds the generation pipeline, so the same
          //     argument applies with money attached: `runGeneration` takes the
          //     vendor call as a callback, and the caller that supplies one is
          //     the caller that meters and debits. app/** reaches a generation
          //     through @respin/credits/app-server, where the money path
          //     already is. The TYPES a screen needs are reachable WITHOUT
          //     naming @respin/modes, but NOT by re-export: the facade's
          //     `export type` block names no `@respin/modes` type, and this
          //     comment claimed it did until slice 6 stage D read it back
          //     (2026-09-01). What is true is INDEXED ACCESS through the
          //     facade's own result type — `NonNullable<GenerateResult["run"]>`
          //     and its members — which is what `app/(product)/studio/
          //     projection.ts` does and documents. A screen therefore names the
          //     shape without importing the package, which is the property the
          //     denial needs; re-export would have been a second, wider way to
          //     the same place. `app/(product)/billing-errors.ts` records the
          //     precedent, that widening a package boundary so a screen or a
          //     test can name a class is "loosening a tenancy boundary for a
          //     convenience".
          //
          // Fixtures for both live in tests/import-boundary.test.ts, and slice
          // 6 adds the packages/**-direction half: `@respin/modes` ROOT is
          // reachable from packages/credits (stage C composes it) while
          // `@respin/modes/src/...` is not.
          group: [
            "@respin/*",
            "@respin/*/**",
            // The roots — negated so they are not excluded PARENTS.
            "!@respin/db",
            "!@respin/auth",
            "!@respin/credits",
            "!@respin/config",
            // The sanctioned deep entrypoints.
            "!@respin/auth/client",
            "!@respin/credits/app-server",
            "!@respin/config/app-server",
            ...(adminSurface ? ["!@respin/config/admin-server"] : []),
            ...(webhookSurface ? ["!@respin/credits/webhook-server"] : []),
          ],
          message:
            "app/** and lib/** may import only the SANCTIONED @respin/* entrypoints — @respin/db, @respin/auth (+ /client), @respin/credits/app-server, @respin/config/app-server (plus /admin-server in app/(admin) and /credits/webhook-server in the Stripe webhook route). A NEW @respin/* package, or a NEW deep entrypoint into an existing one, is denied by default: add it to this negation list deliberately, with a deny fixture in tests/import-boundary.test.ts, rather than inheriting the boundary by omission (brain-surface task 25)",
        },
      ],
    },
  ];
}

/**
 * THE SPECIFIER-SHAPE DENY, for packages/** — the same class M1 closed for
 * app/** and left open one directory over (M2a A-2b).
 *
 * ONE builder, both blocks, for the reason this file already learned once: a
 * hand-copied second list drifts, and the block that drifts is the one nobody
 * re-reads. Every rule anchored to a `@respin/…` package NAME is bypassable by
 * spelling the same module as a path, and from `packages/credits/src` BOTH
 * `"@respin/db/src/with-workspace"` and `"../../db/src/with-workspace"` were
 * ALLOWED — probe-confirmed against the installed engine — in the milestone
 * that puts the tenancy cage inside that exact module. A package reaches
 * another package through its ROOT, where the sanctioned surface lives.
 *
 * Same-package relatives (`./x`, `../x`) are untouched: they never cross a
 * package boundary, and packages/db's own modules import each other that way.
 */
const CROSS_PACKAGE_DENY = {
  group: [
    // Another package's INTERNALS, by package name.
    "@respin/*/src",
    "@respin/*/src/*",
    "@respin/*/src/**",
    // Any spelling that names a `packages/<pkg>/src` path explicitly.
    "**/packages/*/src",
    "**/packages/*/src/*",
    "**/packages/*/src/**",
    "@/packages/**",
    // Relative paths that climb OUT of one package and into another's src.
    // `../../<pkg>/src/...` from packages/<x>/src or packages/<x>/tests, and a
    // level or two deeper for files under a subdirectory.
    "../../*/src",
    "../../*/src/*",
    "../../*/src/**",
    "../../../*/src",
    "../../../*/src/*",
    "../../../*/src/**",
    "../../../../*/src/*",
    "../../../../*/src/**",
  ],
  message:
    "packages/** reach another package through its @respin/* ROOT or a DECLARED entrypoint (./app-server, ./webhook-server, ./admin-server, ./client) — never into its src/. A deep or relative path into another package's internals bypasses every name-anchored rule, including the M2a scope cage (tenancy T1, M2a A-2b)",
};

const APP_DIRECTION_DENY = {
  group: ["**/app/**", "@/app/**"],
  message:
    "packages/ must never import from app/ (tech-spec §1 import-direction rule)",
};

export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "**/node_modules/**", "next-env.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // tech-spec §1: app/ imports from packages/; packages never import from app/.
    // PLUS the trustWorkspaceId cage (tenancy plan-gate finding 4): the
    // non-session mint is importable ONLY from the named sanctioned files
    // (Stripe webhook resolution) and tests — an ALLOWLIST of files, not a
    // deny-list of app/**. The sanctioned files get their own block below.
    files: ["packages/**/*.ts", "packages/**/*.tsx"],
    ignores: [
      "packages/credits/src/stripe/webhooks.ts",
      "packages/credits/src/stripe/customers.ts",
      "packages/*/tests/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@respin/db",
              importNames: ["trustWorkspaceId"],
              message:
                "trustWorkspaceId mints a VerifiedWorkspaceId WITHOUT session verification — only the Stripe webhook resolution files (packages/credits/src/stripe/{webhooks,customers}.ts) and tests may import it (tenancy T1)",
            },
          ],
          patterns: [APP_DIRECTION_DENY, CROSS_PACKAGE_DENY],
        },
      ],
    },
  },
  {
    // The sanctioned trustWorkspaceId call sites: the import-direction rule
    // AND the cross-package shape deny still bind; only the trustWorkspaceId
    // name restriction is lifted. A grant for ONE import name is not a grant to
    // reach the module by a different spelling.
    files: [
      "packages/credits/src/stripe/webhooks.ts",
      "packages/credits/src/stripe/customers.ts",
      "packages/*/tests/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [APP_DIRECTION_DENY, CROSS_PACKAGE_DENY],
        },
      ],
    },
  },
  // T1 default-deny (respin-brain-tenancy; plan-review finding 5): app code
  // may import ONLY the sanctioned package surfaces. allowImportNames makes
  // this an allowlist — an export added in M1 stays unimportable from app/**
  // by default. createDb + drizzle's sql tag would bypass withWorkspace with
  // zero schema imports, so the connection is denied here too — by BOTH
  // package name and path spelling. Stated precisely, because a claim is only
  // worth what enforces it: THIS rule sees static `import`/`export … from`
  // only. ESLint's no-restricted-imports registers no ImportExpression
  // handler, so `await import(...)` is invisible to it and is covered instead
  // by the source scan in tests/import-boundary.test.ts. Two mechanisms, both
  // asserted; neither one alone is "unreachable".
  // Scope is EVERYTHING except packages/** and tests/**. The rule value is
  // built by ONE function so the app/(admin) override cannot drift from the
  // base (M1 phase 3 task 8b): `adminSurface` additionally admits the config
  // WRITE entrypoint (@respin/config/admin-server) — admin routes only.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["packages/**", "tests/**"],
    rules: {
      "no-restricted-imports": appRestrictedImports(),
    },
  },
  {
    // app/(admin)/** — same rule via the same builder, plus the config WRITE
    // entrypoint. Never widened elsewhere.
    files: ["app/(admin)/**/*.ts", "app/(admin)/**/*.tsx"],
    rules: {
      "no-restricted-imports": appRestrictedImports({ adminSurface: true }),
    },
  },
  {
    // app/api/stripe/webhook/route.ts — THE ONE FILE, not a subtree. Same rule
    // via the same builder, plus the Stripe SDK and the event dispatcher.
    //
    // Round 2 scoped this to `app/api/stripe/**` → `app/api/stripe/webhook/**`,
    // which is still a subtree: a helper module beside the route inherits both
    // grants, and `export * from "stripe"` there would re-export the SDK to any
    // sibling that imports `@/app/api/stripe/webhook/helper` (probe-confirmed
    // ALLOWed, round-3 NOTE). Only `route.ts` exists today and only `route.ts`
    // performs the signature check that makes dispatch legitimate, so the grant
    // is exactly `route.ts`. A future helper must either be gate-free or get
    // its own named entry here — a deliberate act, with a deny fixture at
    // app/api/stripe/webhook/helper.ts proving the default.
    files: ["app/api/stripe/webhook/route.ts"],
    rules: {
      "no-restricted-imports": appRestrictedImports({ webhookSurface: true }),
    },
  }
);
