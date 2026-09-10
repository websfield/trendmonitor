// Dev seed — idempotent, and DEV-GUARDED: a fake user with an owner membership
// must never land in a real database (phase-2 task 5). "Local" means the host
// is localhost/127.0.0.1/::1; anything else (including a Neon dev branch)
// requires the explicit RESPIN_SEED_FORCE=1 opt-in.
import { eq } from "drizzle-orm";
import type { DbLike } from "./db-like";
import { seedSharedFrameworks } from "./frameworks";
import {
  configVersions,
  memberships,
  user as authUser,
  users,
  workspaces,
} from "./schema";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const DEV_AUTH_USER_ID = "dev_user_local";

export function assertSeedAllowed(
  connectionString: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!connectionString) {
    throw new Error("db:seed requires DATABASE_URL to be set.");
  }
  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    throw new Error(
      "db:seed could not parse DATABASE_URL as a URL — refusing to seed an unidentifiable database."
    );
  }
  if (!LOCAL_HOSTS.has(host) && env.RESPIN_SEED_FORCE !== "1") {
    throw new Error(
      `db:seed refused: "${host}" is not a local host. The seed inserts a fake dev user; ` +
        "to seed a remote DEV database (e.g. a Neon dev branch) deliberately, set RESPIN_SEED_FORCE=1."
    );
  }
}

// Launch-default config v1 (PRD §4G; R-20/D-M1-2). Phase 2's Zod schema in
// packages/config must parse EXACTLY this shape (parity test drives from here).
export const CONFIG_V1_SEED = {
  creditCosts: {
    hookSet: 2,
    caption: 1,
    ideationBatch: 3,
    fullScript: 5,
    autopsy: 4,
    spin: 5,
    revision: 2,
    onboardingBrainBuild: 0,
    // The first credit debit the product ever takes (D-M2-2). Owner decision,
    // `decisions.md` R-37. Explicit in the SEED as well as defaulted in the
    // schema, for the reason `profileCaps` is: a fresh install writes it, so
    // only databases seeded before slice 2a need `config:migrate` at all --
    // and R19 refuses to price a debit from a merely-DEFAULTED key.
    onboardingBrainRebuild: 50,
    trendBrowse: 0,
  },
  allowances: { free: 25, creator: 250, pro: 2000, studio: 8000 },
  pack: { credits: 1000, priceUsd: 10, validityMonths: 12 },
  graceDays: 7,
  pauseMonths: { min: 1, max: 3 },
  // The band that counts as a monthly service period on a grant-bearing
  // invoice (billing round-7 CHANGE 3 — was a pair of constants in
  // packages/credits, which is a threshold in code, i.e. a B5 violation).
  // A calendar month is 28–31 days; the band is wider on purpose, and being
  // config it can be widened from /admin/config without a deploy if a real
  // Stripe payload proves it wrong.
  monthlyPeriodDays: { min: 20, max: 45 },
  stripePriceMap: {},
  // PRD §4G pricing table, "Creator profiles" row. Present in the SEED as well as defaulted in the schema: a
  // fresh install writes it explicitly, so only databases seeded before M2a
  // need `migrate-config` at all.
  profileCaps: { free: 1, creator: 1, pro: 1, studio: 5 },
  // PRD §4G pricing table, "Trend monitor" row (REQ-E05): tracked niches per
  // tier, Free = digest only. Moved from code to config as R-95 (slice 8 fix
  // pass). Explicit in the SEED as well as defaulted in the schema, for the
  // reason `profileCaps` carries: a fresh install writes it, so only databases
  // seeded before this key need `migrate-config` at all.
  trackedNiches: { free: 0, creator: 1, pro: 3, studio: 10 },
  // PRD §4G / R-112. Exact per-tier access; readers must not infer this
  // mapping from whether a subscription exists. Explicit in the seed so a
  // fresh install stores it, while the schema default keeps pre-9b stored
  // documents readable until `config:migrate` runs last.
  performanceLearning: {
    free: "view_only",
    creator: "full",
    pro: "full",
    studio: "full",
  },
  // REQ-G07's monthly-burn context. Three distinct non-zero debit days is a
  // repeated-use product minimum, not a statistical-confidence threshold.
  daysToEmpty: { trailingWindowDays: 30, minimumDebitDays: 3 },
  // tech-spec §6's per-tier generation concurrency, made real by slice 2a's
  // run slot (`packages/db/src/run-slot.ts`). Workspace-grained, not per-user —
  // the divergence from the spec's wording and the reason for it are recorded
  // in `decisions.md` R-39 and in the schema's own comment.
  concurrencyLimits: { free: 2, creator: 2, pro: 4, studio: 8 },
  // Slice 3's onboarding rule: how many of the creator's OWN posts must exist
  // before a voice inference will run. Explicit in the seed for the reason
  // `profileCaps` carries — a fresh install writes it, so a fresh install needs
  // no `migrate-config` to have it. Unlike `llm.prices` a default here is SAFE
  // (it decides whether we ask for more posts, never what anyone is billed),
  // which is why the schema also carries one.
  onboarding: {
    minOwnPostsForVoice: 3,
    voiceCorpusMaxPosts: 50,
    maxUnchargedBillableAttempts: 3,
  },
  // Slice 6 (R16). Generation's own uncharged-billable bound — the same
  // safety rule as `onboarding`'s, on its own per-purpose grain, because
  // `countUnchargedBillableAttempts` counts per purpose. Explicit in the seed
  // as well as defaulted in the schema, so a fresh install writes it.
  generation: {
    // BOTH numbers are chosen and cited in `packages/config/src/schema.ts`:
    // the cap is derived from `concurrencyLimits.studio` (the bound's accepted
    // width is one burst of the tier's slot limit, so a cap at or below 8 is
    // one a single legal burst exhausts), and the window exists because an
    // unwindowed count over an append-only table refuses a profile forever.
    maxUnchargedBillableAttempts: 10,
    // The money-denominated twin of the line above (billing gate 2026-09-04).
    // 1.00 USD per profile per window; see `schema.ts` for why the attempt cap
    // stays 10 and what an `unknown`-cost row does to the sum.
    maxUnchargedBillableCostMicroUsd: 1_000_000,
    unchargedAttemptWindowMinutes: 60,
    // How much of one generation's prompt the framework library may occupy
    // (slice 7, R17). A SPEND DIAL — it sets the input-token floor of every
    // generation that offers frameworks — which is why it is config and not a
    // module constant; the number, and why 20,000, are argued in
    // `packages/config/src/schema.ts` beside the key. Explicit here as well as
    // defaulted in the schema, for the reason `profileCaps` carries: a fresh
    // install writes it, so only databases seeded before slice 7 need
    // `config:migrate` at all.
    frameworkContextCharBudget: 20_000,
  },
  // The Spin hard gate owns its code refusal floor; this stored value can only
  // make it stricter. Seed it explicitly so fresh installs do not rely on a
  // parser default.
  similarity: { strictness: 0.7 },
  // Product-owned daily autopsy ceiling, in micro-USD. The worker preserves
  // its independent code ceiling; this seed matches that ceiling exactly.
  systemAutopsy: { dailyCapMicroUsd: 100_000_000 },
  // Phase 10a: the public Sample Spin purpose cap (R-123, $10/day), matching
  // its code ceiling exactly; config may only tighten it.
  publicSampleSpin: { dailyCapMicroUsd: 10_000_000 },
  // The model layer (slice 2a). Explicit in the seed for the same reason as
  // `profileCaps` and `onboardingBrainRebuild` above: a fresh install writes
  // it, and a merely-defaulted `llm.prices` cannot price a debit (R19).
  llm: {
    models: {
      generation: "claude-sonnet-5",
      classification: "claude-haiku-4-5",
    },
    prices: {
      "claude-sonnet-5": {
        inputNanoUsdPerToken: 3000,
        outputNanoUsdPerToken: 15000,
      },
      "claude-haiku-4-5": {
        inputNanoUsdPerToken: 1000,
        outputNanoUsdPerToken: 5000,
      },
    },
    // See `packages/config/src/schema.ts` for why these are 12,000 / 120 s:
    // both are MEASURED off the first generation that ever completed against
    // the real vendor (2026-09-04), and the deadline sits under the autopsy
    // claim lease's per-stage ceiling. The parity test holds this equal to the
    // schema default.
    maxOutputTokens: 12_000,
    timeoutMs: 120_000,
    // The whole operation's deadline, retries included (production CHANGE 6).
    // Explicit here as well as defaulted in the schema, for the reason
    // `profileCaps` and `onboardingBrainRebuild` carry: a fresh install writes
    // it, and an already-seeded database gets it from `config:migrate`, whose
    // merge recurses (`migrate-config.ts:151-172`). Both routes land on the
    // same number, which is the property the parity test exists to hold.
    overallDeadlineMs: 120_000,
    maxRetries: 2,
  },
  // EMPTY ON A FRESH INSTALL, and that is the correct value rather than a
  // placeholder: a freshly seeded document already holds every corrected
  // number, so no correction in `migrate-config.ts` matches it and none is
  // consumed. It is present rather than defaulted so `config:migrate` on a
  // just-seeded database stays the no-op the A-9 deploy-order test requires.
  // See `appliedCorrections` in `packages/config/src/schema.ts`.
  appliedCorrections: [] as string[],
} as const;

/** Idempotent: running twice changes nothing (unique constraints + lookups). */
export async function seedDb(db: DbLike): Promise<void> {
  await db.transaction(async (tx) => {
    // D-M1-5: the domain users row carries no email, but its auth_user_id FK
    // requires a real auth user row — seed one (dev-only; no credentials, so
    // it can never sign in — the account table stays empty for it).
    const [existingAuthUser] = await tx
      .select()
      .from(authUser)
      .where(eq(authUser.id, DEV_AUTH_USER_ID));
    if (!existingAuthUser) {
      await tx.insert(authUser).values({
        id: DEV_AUTH_USER_ID,
        name: "Dev User",
        email: "dev@local.test",
        updatedAt: new Date(),
      });
    }

    const [existingUser] = await tx
      .select()
      .from(users)
      .where(eq(users.authUserId, DEV_AUTH_USER_ID));

    const user =
      existingUser ??
      (
        await tx
          .insert(users)
          .values({ authUserId: DEV_AUTH_USER_ID })
          .returning()
      )[0];

    const [existingMembership] = await tx
      .select()
      .from(memberships)
      .where(eq(memberships.userId, user.id));

    if (!existingMembership) {
      const [workspace] = await tx
        .insert(workspaces)
        .values({ name: "Dev Workspace" })
        .returning();
      await tx
        .insert(memberships)
        .values({ userId: user.id, workspaceId: workspace.id, role: "owner" });
    }

    // Config v1: insert only when the table is empty (append-only thereafter —
    // config changes go through packages/config's appendConfigVersion).
    const anyConfig = await tx.select().from(configVersions).limit(1);
    if (anyConfig.length === 0) {
      await tx
        .insert(configVersions)
        .values({ content: CONFIG_V1_SEED, createdBy: "seed" });
    }

    // THE APPROVED SHARED FRAMEWORK LIBRARY, F1-F9 (slice 7, R5a).
    //
    // NOT DEV-ONLY, unlike everything above it in this function, and that
    // distinction is worth stating because this file's whole header is about a
    // dev guard. The fake user, the workspace and the membership must never
    // land in a real database; the framework library MUST, because it is
    // product data every workspace reads and it belongs to nobody
    // (`owner_profile_id`/`workspace_id` NULL by CHECK). `assertSeedAllowed`
    // still gates the whole command, so the library reaches production
    // through the same deliberate run — the alternative, a second seed
    // command nobody runs, is how a library ships empty.
    //
    // Idempotent by `onConflictDoNothing` and NEVER overwriting: see
    // `seedSharedFrameworks` for why re-running must not reassert this file's
    // opinion over a curator's later decision.
    await seedSharedFrameworks(tx);
  });
}
