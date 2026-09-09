// Phase 10b-1 Task 4.2 — DB-atomic auth-mail admission under REAL PostgreSQL
// concurrency. PGlite is single-session, so the daily-ceiling count-then-insert
// race can only be proven here: N simultaneous admissions against a ceiling of
// M must admit exactly M rows and refuse exactly N - M, with the invite
// ceiling holding independently inside the total.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUTH_MAIL_RECOVERY_RESERVE, admitAuthMail, AuthMailRefusedError } from "../src/auth-mail";
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
    // ONE SUBJECT PER ATTEMPT. This case is about the GLOBAL ceiling under real
    // concurrency; driving 80 concurrent admissions from a single user
    // conflated it with the per-subject bucket added in round 3, which exists
    // precisely because password reset and email verification are reachable
    // before authentication and a single global bucket was therefore a
    // month-long denial of service for one unauthenticated attacker.
    for (let index = 0; index < 80; index += 1) {
      await seedAuthUser(harness.db, `quota-user-${index}`, `quota-${index}@example.test`);
    }
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  it(
    "admits exactly the ceiling under 40 concurrent security sends and 40 concurrent invites",
    async () => {
      const db = harness!.db;
      // 40 total with 10 invites keeps the compiled 30/day security reserve
      // (a tighter total would be refused by resolveAuthMailCeilings).
      const ceilings = { totalPerDay: 40, invitesPerDay: 10 };
      const expiresAt = () => new Date(Date.now() + 10 * 60_000);
      const attempts = [
        ...Array.from({ length: 40 }, () => "password_reset" as const),
        ...Array.from({ length: 40 }, () => "workspace_invite" as const),
      ];
      const outcomes = await Promise.all(
        attempts.map((purpose, index) =>
          admitAuthMail(db, {
            purpose,
            authUserId: `quota-user-${index}`,
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
      // The effective total for every purpose EXCEPT identity-deletion recovery
      // is the ceiling minus the recovery floor: a reset or invite flood must
      // not be able to deny someone their single-use deletion-recovery
      // credential (REQ-A04's erasure right).
      expect(rows).toHaveLength(ceilings.totalPerDay - AUTH_MAIL_RECOVERY_RESERVE.perDay);
      const invitesAdmitted = rows.filter((row) => row.purpose === "workspace_invite").length;
      expect(invitesAdmitted).toBeLessThanOrEqual(ceilings.invitesPerDay);
      const effectiveTotal = ceilings.totalPerDay - AUTH_MAIL_RECOVERY_RESERVE.perDay;
      expect(outcomes.filter((o) => o.admitted)).toHaveLength(effectiveTotal);
      const refusalCodes = new Set(outcomes.filter((o) => !o.admitted).map((o) => o.code));
      expect([...refusalCodes].sort()).toEqual(
        [...new Set([
          "quota_day_exhausted",
          ...(invitesAdmitted === ceilings.invitesPerDay ? ["invite_quota_day_exhausted"] : []),
        ])].sort()
      );
      // The security reserve was never consumable by invites. It is measured
      // against the EFFECTIVE total, since the recovery floor is carved out of
      // the ceiling before any non-recovery purpose sees it.
      expect(rows.filter((row) => row.purpose === "password_reset").length).toBeGreaterThanOrEqual(
        effectiveTotal - ceilings.invitesPerDay
      );
      // Every admitted row has a unique id and no address.
      expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
      expect(JSON.stringify(rows)).not.toContain("quota-0@example.test");
      expect(JSON.stringify(rows)).not.toMatch(/@example\.test/);
    },
    60_000
  );
});
