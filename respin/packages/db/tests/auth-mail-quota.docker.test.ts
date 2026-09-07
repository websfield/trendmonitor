// Phase 10b-1 Task 4.2 — DB-atomic auth-mail admission under REAL PostgreSQL
// concurrency. PGlite is single-session, so the daily-ceiling count-then-insert
// race can only be proven here: N simultaneous admissions against a ceiling of
// M must admit exactly M rows and refuse exactly N - M, with the invite
// ceiling holding independently inside the total.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admitAuthMail, AuthMailRefusedError } from "../src/auth-mail";
import { authMailOutbox } from "../src/auth-mail-schema";
import { createDockerTestDb, seedAuthUser } from "../src/testing";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[auth-mail-quota.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: concurrent auth-mail admissions cannot exceed the " +
      "compiled daily ceiling or let invites consume the security reserve."
  );
}

const describeLive = MAINTENANCE_URL ? describe : describe.skip;

describeLive("auth-mail quota admission on real PostgreSQL", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>> | undefined;

  beforeAll(async () => {
    harness = await createDockerTestDb(MAINTENANCE_URL as string, "respin_test_authmail");
    await seedAuthUser(harness.db, "quota-user", "quota@example.test");
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  it(
    "admits exactly the ceiling under 40 concurrent security sends and 40 concurrent invites",
    async () => {
      const db = harness!.db;
      // 30 total with 10 invites keeps the compiled 20/day security reserve
      // (a tighter total would be refused by resolveAuthMailCeilings).
      const ceilings = { totalPerDay: 30, invitesPerDay: 10 };
      const expiresAt = () => new Date(Date.now() + 10 * 60_000);
      const attempts = [
        ...Array.from({ length: 40 }, () => "password_reset" as const),
        ...Array.from({ length: 40 }, () => "workspace_invite" as const),
      ];
      const outcomes = await Promise.all(
        attempts.map((purpose) =>
          admitAuthMail(db, {
            purpose,
            authUserId: "quota-user",
            actionExpiresAt: expiresAt(),
            ceilings,
          }).then(
            (admission) => ({ purpose, admitted: true as const, id: admission.row.id }),
            (error: unknown) => {
              if (!(error instanceof AuthMailRefusedError)) throw error;
              return { purpose, admitted: false as const, code: error.code };
            }
          )
        )
      );
      const rows = await db.select().from(authMailOutbox);
      expect(rows).toHaveLength(ceilings.totalPerDay);
      const invitesAdmitted = rows.filter((row) => row.purpose === "workspace_invite").length;
      expect(invitesAdmitted).toBeLessThanOrEqual(ceilings.invitesPerDay);
      expect(outcomes.filter((o) => o.admitted)).toHaveLength(ceilings.totalPerDay);
      const refusalCodes = new Set(outcomes.filter((o) => !o.admitted).map((o) => o.code));
      expect([...refusalCodes].sort()).toEqual(
        [...new Set([
          "quota_day_exhausted",
          ...(invitesAdmitted === ceilings.invitesPerDay ? ["invite_quota_day_exhausted"] : []),
        ])].sort()
      );
      // The security reserve was never consumable by invites.
      expect(rows.filter((row) => row.purpose === "password_reset").length).toBeGreaterThanOrEqual(
        ceilings.totalPerDay - ceilings.invitesPerDay
      );
      // Every admitted row has a unique id and no address.
      expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
      expect(JSON.stringify(rows)).not.toContain("quota@example.test");
    },
    60_000
  );
});
