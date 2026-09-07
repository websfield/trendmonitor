import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");

async function applyMigration(client: PGlite, name: string): Promise<void> {
  const sql = readFileSync(join(MIGRATIONS, name), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.exec(statement);
  }
}

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

describe("Phase 10b-1 lifecycle migration upgrades", () => {
  it("0046 backfills stable requester digests before raw identity links become nullable", async () => {
    const client = new PGlite();
    const files = readdirSync(MIGRATIONS)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    const migration = files.find((name) => name.startsWith("0046_"));
    expect(migration, "migration 0046 is missing").toBeDefined();
    for (const name of files.filter((name) => name < migration!)) {
      await applyMigration(client, name);
    }

    const authUserId = "migration-requester-auth";
    const userId = "019b0d7a-86df-7000-8000-000000000001";
    const workspaceId = "019b0d7a-86df-7000-8000-000000000002";
    const operationId = "019b0d7a-86df-7000-8000-000000000003";
    const transitionId = "019b0d7a-86df-7000-8000-000000000004";
    const payloadHash = sha("0046-populated-upgrade");
    await client.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ('${authUserId}', 'Requester', 'requester@example.test', true, now(), now());
      INSERT INTO "users" (id, auth_user_id) VALUES ('${userId}', '${authUserId}');
      INSERT INTO "workspaces" (id, name) VALUES ('${workspaceId}', 'Migration workspace');
      INSERT INTO "deletion_operations" (
        id, scope, target_key, workspace_id, requester_user_id,
        request_session_digest, request_membership_version,
        request_workspace_lifecycle_version, idempotency_key, payload_hash
      ) VALUES (
        '${operationId}', 'workspace', 'workspace:${workspaceId}', '${workspaceId}', '${userId}',
        '${sha("0046-session")}', 1, 1, '0046-upgrade-request', '${payloadHash}'
      );
      INSERT INTO "deletion_operation_transitions" (
        id, operation_id, scope, target_key, workspace_id, requester_user_id,
        version, from_state, to_state, payload_hash, external_receipt_digest
      ) VALUES (
        '${transitionId}', '${operationId}', 'workspace', 'workspace:${workspaceId}', '${workspaceId}', '${userId}',
        1, 'requested', 'journal_pending', '${payloadHash}', '${sha("0046-receipt")}'
      );
    `);

    await applyMigration(client, migration!);
    const expectedDigest = sha(`respin:deletion-requester:v1:${userId}`);
    expect(
      (await client.query<{ requester_digest: string }>(
        `SELECT requester_digest FROM deletion_operations WHERE id = '${operationId}'`
      )).rows
    ).toEqual([{ requester_digest: expectedDigest }]);
    expect(
      (await client.query<{ requester_digest: string }>(
        `SELECT requester_digest FROM deletion_operation_transitions WHERE id = '${transitionId}'`
      )).rows
    ).toEqual([{ requester_digest: expectedDigest }]);

    await expect(
      client.exec(
        `UPDATE deletion_operations SET request_session_digest = NULL WHERE id = '${operationId}'`
      )
    ).rejects.toThrow();
    await client.exec(`
      UPDATE deletion_operations
      SET state = 'cancelled',
          request_session_digest = NULL,
          cancellation_replay_digest = '${sha("0046-cancellation-replay")}'
      WHERE id = '${operationId}'
    `);
    expect(
      (await client.query<{ state: string; request_session_digest: string | null }>(`
        SELECT state, request_session_digest
        FROM deletion_operations
        WHERE id = '${operationId}'
      `)).rows
    ).toEqual([{ state: "cancelled", request_session_digest: null }]);
    await client.exec(`
      UPDATE deletion_operations
      SET state = 'complete',
          request_session_digest = NULL,
          cancellation_replay_digest = NULL
      WHERE id = '${operationId}'
    `);
    expect(
      (await client.query<{
        state: string;
        request_session_digest: string | null;
        requester_digest: string;
        journal_version: number;
      }>(`
        SELECT state, request_session_digest, requester_digest, journal_version
        FROM deletion_operations
        WHERE id = '${operationId}'
      `)).rows
    ).toEqual([{
      state: "complete",
      request_session_digest: null,
      requester_digest: expectedDigest,
      journal_version: 0,
    }]);

    await client.exec(`DELETE FROM users WHERE id = '${userId}'`);
    expect(
      (await client.query<{ requester_user_id: string | null; requester_digest: string }>(
        `SELECT requester_user_id, requester_digest FROM deletion_operations WHERE id = '${operationId}'`
      )).rows
    ).toEqual([{ requester_user_id: null, requester_digest: expectedDigest }]);
    expect(
      (await client.query<{ requester_user_id: string | null; requester_digest: string }>(
        `SELECT requester_user_id, requester_digest FROM deletion_operation_transitions WHERE id = '${transitionId}'`
      )).rows
    ).toEqual([{ requester_user_id: null, requester_digest: expectedDigest }]);
  });

  it("0047 refuses ambiguous legacy restore state and then enforces the scoped shape", async () => {
    const client = new PGlite();
    const files = readdirSync(MIGRATIONS)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    const migration = files.find((name) => name.startsWith("0047_"));
    expect(migration, "migration 0047 is missing").toBeDefined();
    for (const name of files.filter((name) => name < migration!)) {
      await applyMigration(client, name);
    }

    const authUserId = "migration-profile-auth";
    const userId = "019b0d7a-86df-7000-8000-000000000011";
    const workspaceId = "019b0d7a-86df-7000-8000-000000000012";
    const profileId = "019b0d7a-86df-7000-8000-000000000013";
    const profileOperationId = "019b0d7a-86df-7000-8000-000000000014";
    const workspaceOperationId = "019b0d7a-86df-7000-8000-000000000015";
    const requesterDigest = sha(`respin:deletion-requester:v1:${userId}`);
    await client.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ('${authUserId}', 'Profile requester', 'profile-requester@example.test', true, now(), now());
      INSERT INTO "users" (id, auth_user_id) VALUES ('${userId}', '${authUserId}');
      INSERT INTO "workspaces" (id, name) VALUES ('${workspaceId}', 'Profile migration workspace');
      INSERT INTO "creator_profiles" (id, workspace_id, display_name)
      VALUES ('${profileId}', '${workspaceId}', 'Archived profile');
      INSERT INTO "deletion_operations" (
        id, scope, target_key, workspace_id, profile_id, requester_user_id,
        requester_digest, request_session_digest, request_membership_version,
        request_workspace_lifecycle_version, request_profile_lifecycle_version,
        idempotency_key, payload_hash, profile_prior_state
      ) VALUES (
        '${profileOperationId}', 'profile', 'profile:${workspaceId}:${profileId}',
        '${workspaceId}', '${profileId}', '${userId}', '${requesterDigest}',
        '${sha("0047-profile-session")}', 1, 1, 1,
        '0047-profile-request', '${sha("0047-profile-payload")}', NULL
      );
      INSERT INTO "deletion_operations" (
        id, scope, target_key, workspace_id, requester_user_id,
        requester_digest, request_session_digest, request_membership_version,
        request_workspace_lifecycle_version, idempotency_key, payload_hash
      ) VALUES (
        '${workspaceOperationId}', 'workspace', 'workspace:${workspaceId}',
        '${workspaceId}', '${userId}', '${requesterDigest}',
        '${sha("0047-workspace-session")}', 1, 1,
        '0047-workspace-request', '${sha("0047-workspace-payload")}'
      );
    `);

    await expect(applyMigration(client, migration!)).rejects.toThrow(
      "refuses invalid deletion profile restore authority"
    );
    await client.exec(`
      UPDATE deletion_operations
      SET profile_prior_state = 'archived'
      WHERE id = '${profileOperationId}'
    `);
    await applyMigration(client, migration!);

    await expect(
      client.exec(
        `UPDATE deletion_operations SET profile_prior_state = NULL WHERE id = '${profileOperationId}'`
      )
    ).rejects.toThrow();
    await expect(
      client.exec(
        `UPDATE deletion_operations SET profile_prior_state = 'active' WHERE id = '${workspaceOperationId}'`
      )
    ).rejects.toThrow();
    await client.exec(`
      UPDATE deletion_operations
      SET profile_prior_state = 'active'
      WHERE id = '${profileOperationId}'
    `);
    expect(
      (await client.query<{ profile_prior_state: string | null }>(`
        SELECT profile_prior_state
        FROM deletion_operations
        WHERE id = '${profileOperationId}'
      `)).rows
    ).toEqual([{ profile_prior_state: "active" }]);
  });

  it("0048 refuses invalid populated money rows before DDL and reruns cleanly after repair", async () => {
    const client = new PGlite();
    const files = readdirSync(MIGRATIONS)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    const migration = files.find((name) => name.startsWith("0048_"));
    expect(migration, "migration 0048 is missing").toBeDefined();
    for (const name of files.filter((name) => name < migration!)) {
      await applyMigration(client, name);
    }

    const workspaceId = "019b0d7a-86df-7000-8000-000000000021";
    const ledgerId = "019b0d7a-86df-7000-8000-000000000022";
    await client.exec(`
      INSERT INTO "workspaces" (id, name)
      VALUES ('${workspaceId}', 'Auto top-up migration workspace');
      INSERT INTO "credit_ledger" (
        id, workspace_id, delta, kind, ref_type, expires_at
      ) VALUES (
        '${ledgerId}', '${workspaceId}', 1000, 'pack', 'auto_topup',
        now() + interval '12 months'
      );
    `);

    await expect(applyMigration(client, migration!)).rejects.toThrow(
      "0048 preflight"
    );
    expect(
      (await client.query<{ relation_name: string | null }>(
        `SELECT to_regclass('public.auto_topup_protocol_rollouts')::text AS relation_name`
      )).rows
    ).toEqual([{ relation_name: null }]);
    expect(
      (await client.query<{ n: number }>(`
        SELECT count(*)::int AS n
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscriptions'
          AND column_name = 'auto_topup_attempt_id'
      `)).rows
    ).toEqual([{ n: 0 }]);

    await client.exec(`
      UPDATE "credit_ledger"
      SET ref_id = 'pi_migration_repaired',
          stripe_event_id = 'evt_migration_repaired',
          amount_cents = 1000,
          config_version = 1
      WHERE id = '${ledgerId}'
    `);
    await applyMigration(client, migration!);
    expect(
      (await client.query<{ state: string }>(
        `SELECT state FROM auto_topup_protocol_rollouts WHERE protocol = 'v1'`
      )).rows
    ).toEqual([{ state: "expanded" }]);
    expect(
      (await client.query<{
        auto_topup_attempt_id: string | null;
        auto_topup_period_month_utc: string | null;
      }>(`
        SELECT auto_topup_attempt_id, auto_topup_period_month_utc
        FROM credit_ledger WHERE id = '${ledgerId}'
      `)).rows
    ).toEqual([{
      auto_topup_attempt_id: null,
      auto_topup_period_month_utc: null,
    }]);

    for (const column of [
      "amount_cents",
      "config_version",
    ]) {
      await expect(
        client.exec(`
          UPDATE credit_ledger SET "${column}" = NULL
          WHERE id = '${ledgerId}'
        `),
        `${column}=NULL must not satisfy the settled auto-top-up CHECK via UNKNOWN`
      ).rejects.toThrow("credit_ledger_auto_topup_attempt_shape");
    }

    expect(
      (await client.query<{
        column_name: string;
        column_default: string | null;
      }>(`
        SELECT column_name, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscriptions'
          AND column_name IN (
            'auto_topup_protocol_version',
            'auto_topup_attempt_cutover_at'
          )
        ORDER BY column_name
      `)).rows
    ).toEqual([
      { column_name: "auto_topup_attempt_cutover_at", column_default: null },
      { column_name: "auto_topup_protocol_version", column_default: "0" },
    ]);

    const expandedSubscriptionId = "019b0d7a-86df-7000-8000-000000000023";
    await client.exec(`
      INSERT INTO "subscriptions" (id, workspace_id, stripe_customer_id)
      VALUES (
        '${expandedSubscriptionId}',
        '${workspaceId}',
        'cus_0048_expanded'
      )
    `);
    expect(
      (await client.query<{
        auto_topup_protocol_version: number;
        auto_topup_attempt_cutover_at: Date | null;
        auto_topup_v1_enabled: boolean;
      }>(`
        SELECT auto_topup_protocol_version,
               auto_topup_attempt_cutover_at,
               auto_topup_v1_enabled
        FROM subscriptions WHERE id = '${expandedSubscriptionId}'
      `)).rows
    ).toEqual([{
      auto_topup_protocol_version: 0,
      auto_topup_attempt_cutover_at: null,
      auto_topup_v1_enabled: false,
    }]);

    const expandedSettlementId = "019b0d7a-86df-7000-8000-000000000028";
    await client.exec(`
      INSERT INTO credit_ledger (
        id, workspace_id, delta, kind, ref_type, ref_id, stripe_event_id,
        amount_cents, config_version, expires_at
      ) VALUES (
        '${expandedSettlementId}', '${workspaceId}', 500, 'pack', 'auto_topup',
        'pi_0048_expanded', 'evt_0048_expanded', 1000, 1,
        now() + interval '12 months'
      )
    `);
    expect(
      (await client.query<{
        auto_topup_attempt_id: string;
        auto_topup_period_month_utc: string;
      }>(`
        SELECT auto_topup_attempt_id, auto_topup_period_month_utc
        FROM credit_ledger WHERE id = '${expandedSettlementId}'
      `)).rows
    ).toEqual([{
      auto_topup_attempt_id: expandedSettlementId,
      auto_topup_period_month_utc: expect.stringMatching(/^\d{4}-\d{2}$/),
    }]);

    await client.exec(`
      UPDATE auto_topup_protocol_rollouts
      SET state = 'active',
          revision = 1,
          fleet_quiesced_at = now(),
          drain_started_at = now(),
          provider_reconciled_at = now(),
          reconciled_customers = 1,
          reconciled_payment_intents = 0,
          authority_key_id = 'v1',
          authority_key_fingerprint = 'sha256:${"a".repeat(64)}',
          stripe_account_id = 'acct_migrationtest',
          stripe_livemode = false,
          activated_at = now()
      WHERE protocol = 'v1';
      INSERT INTO "workspaces" (id, name)
      VALUES (
        '019b0d7a-86df-7000-8000-000000000024',
        'Post-activation insert workspace'
      );
      INSERT INTO "subscriptions" (
        id, workspace_id, stripe_customer_id,
        auto_topup_protocol_version, auto_topup_attempt_cutover_at
      ) VALUES (
        '019b0d7a-86df-7000-8000-000000000025',
        '019b0d7a-86df-7000-8000-000000000024',
        'cus_0048_active',
        0,
        NULL
      );
    `);
    expect(
      (await client.query<{
        auto_topup_protocol_version: number;
        cutover_is_set: boolean;
        auto_topup_v1_enabled: boolean;
      }>(`
        SELECT auto_topup_protocol_version,
               auto_topup_attempt_cutover_at IS NOT NULL AS cutover_is_set,
               auto_topup_v1_enabled
        FROM subscriptions
        WHERE id = '019b0d7a-86df-7000-8000-000000000025'
      `)).rows
    ).toEqual([{
      auto_topup_protocol_version: 1,
      cutover_is_set: true,
      auto_topup_v1_enabled: false,
    }]);

    await expect(
      client.exec(`
        INSERT INTO credit_ledger (
          id, workspace_id, delta, kind, ref_type, ref_id, stripe_event_id,
          amount_cents, config_version, expires_at
        ) VALUES (
          '019b0d7a-86df-7000-8000-000000000029', '${workspaceId}', 500,
          'pack', 'auto_topup', 'pi_0048_active_unbound',
          'evt_0048_active_unbound', 1000, 1, now() + interval '12 months'
        )
      `)
    ).rejects.toThrow(
      "auto_topup ledger rows require durable attempt authority after activation"
    );

    await client.exec(`
      UPDATE subscriptions
      SET auto_topup_attempt_id = '019b0d7a-86df-7000-8000-000000000026',
          auto_topup_attempt_period_month_utc = '2026-09',
          auto_topup_attempt_ordinal = 1,
          auto_topup_attempt_idempotency_key = 'autotopup:v1:migration',
          auto_topup_attempt_amount_cents = 1000,
          auto_topup_attempt_currency = 'usd',
          auto_topup_attempt_price_id = 'price_migration_pack',
          auto_topup_attempt_credits = 500,
          auto_topup_attempt_validity_months = 12,
          auto_topup_attempt_config_version = 1,
          auto_topup_attempt_customer_id = 'cus_0048_active',
          auto_topup_attempt_payment_intent_id = 'pi_0048_active',
          auto_topup_attempt_payment_intent_status = 'processing',
          auto_topup_attempt_reserved_at = now(),
          auto_topup_attempt_dispatched_at = now(),
          auto_topup_attempt_claim_id = '019b0d7a-86df-7000-8000-000000000027',
          auto_topup_attempt_claimed_at = now()
      WHERE id = '019b0d7a-86df-7000-8000-000000000025'
    `);
    for (const column of [
      "auto_topup_attempt_period_month_utc",
      "auto_topup_attempt_ordinal",
      "auto_topup_attempt_amount_cents",
      "auto_topup_attempt_currency",
      "auto_topup_attempt_credits",
      "auto_topup_attempt_validity_months",
      "auto_topup_attempt_config_version",
      "auto_topup_attempt_payment_intent_status",
      "auto_topup_attempt_dispatched_at",
      "auto_topup_attempt_claimed_at",
    ]) {
      await expect(
        client.exec(`
          UPDATE subscriptions SET "${column}" = NULL
          WHERE id = '019b0d7a-86df-7000-8000-000000000025'
        `),
        `${column}=NULL must not satisfy the durable-attempt CHECK via UNKNOWN`
      ).rejects.toThrow("subscriptions_auto_topup_attempt_shape");
    }
    for (const column of [
      "reconciled_customers",
      "reconciled_payment_intents",
      "authority_key_id",
      "authority_key_fingerprint",
      "stripe_account_id",
    ]) {
      await expect(
        client.exec(`
          UPDATE auto_topup_protocol_rollouts SET "${column}" = NULL
          WHERE protocol = 'v1'
        `),
        `${column}=NULL must not satisfy the active-rollout CHECK via UNKNOWN`
      ).rejects.toThrow("auto_topup_protocol_rollouts_shape");
    }
  });

  it("0049 preserves expansion compatibility, then fences legacy writes and terminal rollback shapes", async () => {
    const client = new PGlite();
    const files = readdirSync(MIGRATIONS)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    const migration = files.find((name) => name.startsWith("0049_"));
    expect(migration, "migration 0049 is missing").toBeDefined();
    for (const name of files.filter((name) => name < migration!)) {
      await applyMigration(client, name);
    }

    const deadWorkspace = "019b0d7a-86df-7000-8000-000000000041";
    const canceledWorkspace = "019b0d7a-86df-7000-8000-000000000042";
    const liveWorkspace = "019b0d7a-86df-7000-8000-000000000043";
    await client.exec(`
      INSERT INTO workspaces (id, name) VALUES
        ('${deadWorkspace}', '0049 dead'),
        ('${canceledWorkspace}', '0049 canceled'),
        ('${liveWorkspace}', '0049 live');
      INSERT INTO subscriptions (
        id, workspace_id, stripe_customer_id, stripe_subscription_id, status
      ) VALUES
        ('019b0d7a-86df-7000-8000-000000000044', '${deadWorkspace}', 'cus_0049_dead', NULL, 'none'),
        ('019b0d7a-86df-7000-8000-000000000045', '${canceledWorkspace}', 'cus_0049_canceled', 'sub_0049_canceled', 'canceled'),
        ('019b0d7a-86df-7000-8000-000000000046', '${liveWorkspace}', 'cus_0049_live', 'sub_0049_live', 'active');
    `);

    await applyMigration(client, migration!);
    expect(
      (await client.query<{ state: string }>(`
        SELECT state FROM tier_checkout_protocol_rollouts WHERE protocol = 'v1'
      `)).rows
    ).toEqual([{ state: "expanded" }]);
    expect(
      (await client.query<{ n: number }>(`
        SELECT count(*)::int AS n FROM subscriptions
        WHERE tier_checkout_fence_at IS NOT NULL
      `)).rows
    ).toEqual([{ n: 0 }]);

    const packLedgerId = "019b0d7a-86df-7000-8000-000000000051";
    const packAttemptId = "019b0d7a-86df-4000-8000-000000000052";
    const tierLedgerId = "019b0d7a-86df-7000-8000-000000000053";
    const tierAttemptId = "019b0d7a-86df-4000-8000-000000000054";
    await client.exec(`
      INSERT INTO credit_ledger (
        id, workspace_id, delta, kind, ref_type, ref_id, stripe_event_id,
        expires_at, amount_cents, config_version, pack_checkout_attempt_id
      ) VALUES (
        '${packLedgerId}', '${deadWorkspace}', 100, 'pack', 'checkout_session',
        'cs_0049_null_shape', 'evt_0049_pack_shape', now() + interval '1 month',
        1000, 1, '${packAttemptId}'
      );
      INSERT INTO credit_ledger (
        id, workspace_id, delta, kind, ref_type, ref_id, stripe_event_id,
        expires_at, config_version, tier_checkout_attempt_id
      ) VALUES (
        '${tierLedgerId}', '${deadWorkspace}', 100, 'grant', 'invoice',
        'in_0049_null_shape', 'evt_0049_tier_shape', now() + interval '1 month',
        1, '${tierAttemptId}'
      );
    `);
    for (const [ledgerRowId, constraint, columns] of [
      [
        packLedgerId,
        "credit_ledger_pack_checkout_attempt_shape",
        ["ref_id", "stripe_event_id", "amount_cents", "config_version"],
      ],
      [
        tierLedgerId,
        "credit_ledger_tier_checkout_attempt_shape",
        ["ref_id", "stripe_event_id", "config_version"],
      ],
    ] as const) {
      for (const column of columns) {
        await expect(
          client.exec(`UPDATE credit_ledger SET "${column}" = NULL WHERE id = '${ledgerRowId}'`),
          `${constraint}: ${column}=NULL must not pass as SQL UNKNOWN`
        ).rejects.toThrow(constraint);
      }
    }
    await client.exec(`
      DELETE FROM credit_ledger
      WHERE id IN ('${packLedgerId}', '${tierLedgerId}')
    `);

    await expect(
      client.exec(`
        UPDATE subscriptions
        SET tier_checkout_attempt_id = '019b0d7a-86df-7000-8000-000000000047'
        WHERE workspace_id = '${deadWorkspace}'
      `)
    ).rejects.toThrow("attempt creation requires active rollout");

    await client.exec(`
      UPDATE tier_checkout_protocol_rollouts
      SET state = 'draining', revision = 1,
          fleet_quiesced_at = now(), drain_started_at = now(),
          stripe_account_id = 'acct_0049migration', stripe_livemode = false
      WHERE protocol = 'v1';
      UPDATE subscriptions SET status = status
      WHERE workspace_id IN ('${deadWorkspace}', '${canceledWorkspace}');
      UPDATE subscriptions SET status = 'canceled'
      WHERE workspace_id = '${liveWorkspace}';
      INSERT INTO workspaces (id, name)
      VALUES ('019b0d7a-86df-7000-8000-000000000048', '0049 post-drain insert');
    `);
    await expect(
      client.exec(`
        INSERT INTO subscriptions (
          id, workspace_id, stripe_customer_id, stripe_subscription_id, status
        ) VALUES (
          '019b0d7a-86df-7000-8000-000000000049',
          '019b0d7a-86df-7000-8000-000000000048',
          'cus_0049_post_drain', NULL, 'none'
        )
      `)
    ).rejects.toThrow("closed during tier Checkout drain");
    expect(
      (await client.query<{
        workspace_id: string;
        stripe_subscription_id: string;
        status: string;
        fence_status: string;
      }>(`
        SELECT workspace_id, stripe_subscription_id, status,
               tier_checkout_fence_status AS fence_status
        FROM subscriptions
        ORDER BY workspace_id
      `)).rows
    ).toEqual([
      {
        workspace_id: deadWorkspace,
        stripe_subscription_id: `checkout_fence:${deadWorkspace}`,
        status: "incomplete",
        fence_status: "none",
      },
      {
        workspace_id: canceledWorkspace,
        stripe_subscription_id: `checkout_fence:${canceledWorkspace}`,
        status: "incomplete",
        fence_status: "canceled",
      },
      {
        workspace_id: liveWorkspace,
        stripe_subscription_id: `checkout_fence:${liveWorkspace}`,
        status: "incomplete",
        fence_status: "canceled",
      },
    ]);

    await client.exec(`
      UPDATE tier_checkout_protocol_rollouts
      SET state = 'active', provider_reconciled_at = now(),
          reconciled_customers = 3, reconciled_sessions = 0,
          activated_at = now()
      WHERE protocol = 'v1';
      UPDATE subscriptions
      SET tier_checkout_attempt_id = '019b0d7a-86df-7000-8000-000000000050',
          tier_checkout_attempt_tier = 'creator',
          tier_checkout_attempt_price_id = 'price_0049_creator',
          tier_checkout_attempt_customer_id = 'cus_0049_dead',
          tier_checkout_attempt_subscription_generation = NULL,
          tier_checkout_attempt_idempotency_key =
            'checkout:v1:${deadWorkspace}:019b0d7a-86df-7000-8000-000000000050',
           tier_checkout_attempt_stripe_account_id = 'acct_0049migration',
           tier_checkout_attempt_stripe_livemode = false,
           tier_checkout_attempt_authority = '{}'::jsonb,
           tier_checkout_attempt_reserved_at = now()
      WHERE workspace_id = '${deadWorkspace}';
    `);
    await client.exec(`SET TIME ZONE 'America/New_York'`);
    const utcPackAttemptId = "019b0d7a-86df-4000-8000-000000000055";
    await client.exec(`
      INSERT INTO stripe_events (
        id, type, payload, workspace_id, stripe_customer_id,
        receipt_attribution, outcome, processed_at
      ) VALUES (
        'evt_0049_utc_pack', 'checkout.session.completed',
        '{
          "id":"evt_0049_utc_pack",
          "object":"event",
          "type":"checkout.session.completed",
          "created":1706743800,
          "data":{"object":{"id":"cs_0049_utc_pack","metadata":{
            "respin_pack_attempt_id":"${utcPackAttemptId}",
            "credits":"100",
            "amount_cents":"1000",
            "config_version":"1",
            "validity_months":"2",
            "respin_authority_sig":"${"a".repeat(64)}"
          }}}
        }'::jsonb,
        '${deadWorkspace}', 'cus_0049_dead',
        'workspace_attributed', 'processed', now()
      );
      INSERT INTO credit_ledger (
        id, workspace_id, delta, kind, ref_type, ref_id, stripe_event_id,
        expires_at, amount_cents, config_version, pack_checkout_attempt_id
      ) VALUES (
        '019b0d7a-86df-7000-8000-000000000056', '${deadWorkspace}', 100,
        'pack', 'checkout_session', 'cs_0049_utc_pack', 'evt_0049_utc_pack',
        '2024-03-31T23:30:00Z', 1000, 1, '${utcPackAttemptId}'
      );
    `);
    expect(
      (await client.query<{ expires_at: string }>(`
        SELECT to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS expires_at
        FROM credit_ledger WHERE ref_id = 'cs_0049_utc_pack'
      `)).rows
    ).toEqual([{ expires_at: "2024-03-31T23:30:00Z" }]);
    await expect(
      client.exec(`
        INSERT INTO subscriptions (
          id, workspace_id, stripe_customer_id, stripe_subscription_id, status
        ) VALUES (
          '019b0d7a-86df-7000-8000-000000000049',
          '019b0d7a-86df-7000-8000-000000000048',
          'cus_0049_old_binary', NULL, 'none'
        )
      `)
    ).rejects.toThrow("explicit v1 fence shape");
    await client.exec(`
      INSERT INTO subscriptions (
        id, workspace_id, stripe_customer_id, stripe_subscription_id, status,
        tier_checkout_fence_at, tier_checkout_fence_subscription_id,
        tier_checkout_fence_status, tier_checkout_fence_observed_subscription_id
      ) VALUES (
        '019b0d7a-86df-7000-8000-000000000049',
        '019b0d7a-86df-7000-8000-000000000048',
        'cus_0049_v1',
        'checkout_fence:019b0d7a-86df-7000-8000-000000000048',
        'incomplete', now(), NULL, 'none', NULL
      )
    `);
    await expect(
      client.exec(`
        UPDATE subscriptions
        SET tier_checkout_attempt_price_id = NULL
        WHERE workspace_id = '${deadWorkspace}'
      `)
    ).rejects.toThrow("attempt authority is immutable");
    await expect(
      client.exec(`
        UPDATE tier_checkout_protocol_rollouts
        SET reconciled_sessions = NULL WHERE protocol = 'v1'
      `)
    ).rejects.toThrow("tier_checkout_protocol_rollouts_shape");
    await expect(
      client.exec(`
        UPDATE subscriptions
        SET tier_checkout_fence_status = NULL
        WHERE workspace_id = '${canceledWorkspace}'
      `)
    ).rejects.toThrow("subscriptions_tier_checkout_fence_shape");
  });
});
