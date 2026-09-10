// Phase 10a plan C5 / R-121: the daily aggregate emitter sends counts only,
// suppresses a small cell rather than sending it, withholds an expired
// aggregate, dedupes by a deterministic event id, and stops at the budget.
// The cohorts arrive through the emitter's port, so this suite carries no
// database: `deriveActivationCohorts` is the one seam and has its own suite.
import { describe, expect, it } from "vitest";
import {
  ACTIVATION_COHORT_EVENT,
  MonthlyEventBudget,
  POSTHOG_MONTHLY_EVENT_BUDGET,
  activationCohortEventUuid,
  type ActivationCohort,
} from "@respin/db";
import { emitMaturedActivationCohorts } from "../activation-emitter";

const NOW = new Date("2026-09-09T00:15:00.000Z");
const SINK = { host: "https://eu.i.posthog.com", projectKey: "phc_test" };
const LIMITATION = "emailVerified is read as of capture";

function cohort(over: Partial<ActivationCohort>): ActivationCohort {
  return { cohortDate: "2026-09-06", metricVersion: 1, signups: 12, activated: 5, excluded: 1, smallCell: false, aggregateExpired: false, matured: true, limitation: LIMITATION, ...over };
}

function capture() {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(null, { status: 200 });
  };
  return { bodies, fetchImpl };
}

describe("emitMaturedActivationCohorts", () => {
  it("sends a matured cohort of ten or more as counts under the system identity, suppresses a small cell, withholds an expired one, and never sends an immature one", async () => {
    const rows = [
      cohort({}),
      cohort({ cohortDate: "2026-09-06", metricVersion: 2, signups: 3, activated: 1, excluded: 0, smallCell: true }),
      cohort({ cohortDate: "2024-01-01", signups: 40, activated: 20, aggregateExpired: true }),
      cohort({ cohortDate: "2026-09-08", signups: 40, activated: 9, excluded: 0, matured: false }),
    ];
    const { bodies, fetchImpl } = capture();
    const summary = await emitMaturedActivationCohorts(
      { cohorts: async () => rows, sink: SINK, budget: new MonthlyEventBudget(POSTHOG_MONTHLY_EVENT_BUDGET), fetchImpl },
      NOW,
    );
    expect(summary).toEqual({ matured: 3, emitted: 1, suppressedSmallCell: 1, withheldExpired: 1, notSent: 0, failed: 0 });
    expect(bodies).toHaveLength(1);
    const sent = bodies[0]!;
    expect(sent).toMatchObject({
      api_key: "phc_test",
      event: ACTIVATION_COHORT_EVENT,
      distinct_id: "respin-system",
      properties: { $process_person_profile: false, cohort_date: "2026-09-06", metric_version: 1, signups: 12, activated: 5, excluded: 1 },
    });
    expect(sent.uuid).toBe(activationCohortEventUuid({ cohortDate: "2026-09-06", metricVersion: 1, signups: 12, activated: 5, excluded: 1 }));
    // Counts only: no user, workspace, profile, email, limitation prose or content key exists in the payload.
    const keys = JSON.stringify(sent).toLowerCase();
    for (const forbidden of ["user_id", "workspace", "profile_id", "email", "prompt", "brain", "limitation", LIMITATION.toLowerCase()]) expect(keys).not.toContain(forbidden);
  });

  it("is idempotent by event id: the same matured cohort is the SAME uuid, changed counts are a new one", () => {
    const a = activationCohortEventUuid({ cohortDate: "2026-09-06", metricVersion: 1, signups: 12, activated: 5, excluded: 1 });
    const b = activationCohortEventUuid({ cohortDate: "2026-09-06", metricVersion: 1, signups: 12, activated: 5, excluded: 1 });
    const changed = activationCohortEventUuid({ cohortDate: "2026-09-06", metricVersion: 1, signups: 13, activated: 5, excluded: 1 });
    expect(a).toBe(b);
    expect(a).not.toBe(changed);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("with no sink or no budget nothing is sent and the count says so, never a silent success; the budget only tightens", async () => {
    const rows = [cohort({ cohortDate: "2026-09-01", signups: 25, activated: 10 })];
    const { bodies, fetchImpl } = capture();
    const noSink = await emitMaturedActivationCohorts({ cohorts: async () => rows, sink: null, budget: new MonthlyEventBudget(POSTHOG_MONTHLY_EVENT_BUDGET), fetchImpl }, NOW);
    expect(noSink).toMatchObject({ matured: 1, emitted: 0, notSent: 1 });
    const noBudget = await emitMaturedActivationCohorts({ cohorts: async () => rows, sink: SINK, budget: new MonthlyEventBudget(POSTHOG_MONTHLY_EVENT_BUDGET, 0), fetchImpl }, NOW);
    expect(noBudget).toMatchObject({ emitted: 0, notSent: 1 });
    expect(bodies).toHaveLength(0);
    expect(() => new MonthlyEventBudget(POSTHOG_MONTHLY_EVENT_BUDGET, POSTHOG_MONTHLY_EVENT_BUDGET + 1)).toThrow(/only tighten/);
  });

  it("the last line refuses a small cell even if the caller forgot the flag, and a failed send is counted as failed", async () => {
    const failing: typeof fetch = async () => new Response(null, { status: 500 });
    const rows = [cohort({ cohortDate: "2026-09-01", signups: 9, activated: 1, smallCell: false }), cohort({ cohortDate: "2026-09-02", signups: 30, activated: 3 })];
    const summary = await emitMaturedActivationCohorts({ cohorts: async () => rows, sink: SINK, budget: new MonthlyEventBudget(POSTHOG_MONTHLY_EVENT_BUDGET), fetchImpl: failing }, NOW);
    expect(summary).toMatchObject({ suppressedSmallCell: 1, failed: 1, emitted: 0 });
  });
});
