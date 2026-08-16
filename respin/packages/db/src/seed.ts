// Dev seed — idempotent, and DEV-GUARDED: a fake user with an owner membership
// must never land in a real database (phase-2 task 5). "Local" means the host
// is localhost/127.0.0.1/::1; anything else (including a Neon dev branch)
// requires the explicit RESPIN_SEED_FORCE=1 opt-in.
import { eq } from "drizzle-orm";
import type { DbLike } from "./db-like";
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
  });
}
