ALTER TABLE "workspace_spend_monthly" ADD COLUMN "unknown_call_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill (phase-2b.md's expand/contract note, line ~150): the DEFAULT 0
-- above is correct for grains with no unknown-cost calls, but any grain that
-- already accumulated 'unknown' rows before this migration would otherwise
-- read a false 0% unknown share until its next write nudges it, understating
-- the very uncertainty this column exists to surface. Grain-matched to
-- upsertSpendRollup's own bucketing (spend-rollup.ts's periodMonthUtc: UTC
-- calendar month, workspace_id, resolved_tier) so the backfilled count lands
-- on the exact row a live write would have incremented.
UPDATE "workspace_spend_monthly" AS w
SET "unknown_call_count" = u.n
FROM (
  SELECT
    workspace_id,
    date_trunc('month', created_at AT TIME ZONE 'UTC')::date AS period_month,
    resolved_tier AS tier,
    count(*) AS n
  FROM "model_usage"
  WHERE cost_state = 'unknown'
  GROUP BY workspace_id, date_trunc('month', created_at AT TIME ZONE 'UTC')::date, resolved_tier
) AS u
WHERE w.workspace_id = u.workspace_id
  AND w.period_month = u.period_month
  AND w.tier = u.tier;