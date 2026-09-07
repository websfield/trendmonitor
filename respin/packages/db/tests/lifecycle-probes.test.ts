import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  JSON_PATH_INVENTORY,
  LIFECYCLE_REGISTRY,
  ROW_CLASS_INVENTORY,
  SUPPORTING_LIFECYCLE_STORES,
  type ExecutorId,
} from "../src/creator-data-registry";
import {
  compileLifecycleExecutionTargets,
  lifecycleTargetMatchesRow,
  LIFECYCLE_EXECUTORS,
  type LifecycleExecutionTarget,
  type LifecycleRuntimeSubjects,
} from "../src/lifecycle-executors";
import { migrationInventory } from "../src/lifecycle-inventory";
import {
  assertExecutorProbeAgreement,
  assertProbeClosure,
  deriveExpectedResidueProbes,
  LIFECYCLE_PROBES,
  residueProbeMatchesRow,
} from "../src/lifecycle-probes";

const RESPIN = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DIR = join(RESPIN, "packages/db/migrations");
const migrations = migrationInventory(
  readdirSync(DIR)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, sql: readFileSync(join(DIR, name), "utf8") }))
);
const SUBJECTS = {
  identity: {
    scope: "identity",
    userId: "domain_user_lifecycle_1",
    authUserId: "auth_user_lifecycle_1",
    verificationRows: [
      { kind: "password_reset", identifier: "reset-password:123456789012345678901234", value: "auth_user_lifecycle_1" },
      { kind: "oauth_account_link", identifier: "12345678901234567890123456789012", value: JSON.stringify({ link: { userId: "auth_user_lifecycle_1", email: "creator@example.test" } }) },
    ],
  },
  profile: {
    scope: "profile",
    profileId: "profile_lifecycle_1",
    workspaceId: "workspace_lifecycle_1",
    sourceIds: {
      jobIds: ["job_profile_1"], jobAttemptIds: ["attempt_profile_1"],
      trendItemIds: ["trend_profile_1"], autopsyCacheClaimIds: ["claim_profile_1"],
    },
  },
  workspace: {
    scope: "workspace",
    workspaceId: "workspace_lifecycle_1",
    stripeEventIds: ["evt_workspace_1"],
    stripeCustomerIds: [],
    sourceIds: {
      jobIds: ["job_workspace_1"], jobAttemptIds: ["attempt_workspace_1"],
      trendItemIds: ["trend_workspace_1"], autopsyCacheClaimIds: ["claim_workspace_1"],
    },
  },
  system: { scope: "system", installationId: "installation_lifecycle_1" },
  activeOperation: { scope: "profile" },
} as const satisfies LifecycleRuntimeSubjects;
const WORKSPACE_SUBJECTS = {
  identity: SUBJECTS.identity,
  workspace: SUBJECTS.workspace,
  system: SUBJECTS.system,
  activeOperation: { scope: "workspace" },
} as const satisfies LifecycleRuntimeSubjects;

const expectedTargets = (subjects: LifecycleRuntimeSubjects = SUBJECTS) => deriveExpectedResidueProbes(
  migrations,
  LIFECYCLE_REGISTRY,
  ROW_CLASS_INVENTORY,
  JSON_PATH_INVENTORY,
  subjects,
  SUPPORTING_LIFECYCLE_STORES
);
const executorTargets = (subjects: LifecycleRuntimeSubjects = SUBJECTS) => compileLifecycleExecutionTargets(
  migrations,
  LIFECYCLE_REGISTRY,
  ROW_CLASS_INVENTORY,
  JSON_PATH_INVENTORY,
  subjects,
  SUPPORTING_LIFECYCLE_STORES
);

function replaceTarget(
  targets: readonly LifecycleExecutionTarget[],
  registryKey: string,
  replacement: (target: LifecycleExecutionTarget) => LifecycleExecutionTarget
): readonly LifecycleExecutionTarget[] {
  return targets.map((target) => target.registryKey === registryKey ? replacement(target) : target);
}

function withMatchingDiscriminator(
  target: Readonly<{ selector: LifecycleExecutionTarget["selector"] }>,
  row: Record<string, unknown>
): Record<string, unknown> {
  const discriminator = target.selector.discriminator;
  if (!discriminator) return row;
  return {
    ...row,
    [discriminator.column]: discriminator.operator === "is_null"
      ? null
      : discriminator.operator === "is_not_null"
        ? "present"
        : discriminator.value,
  };
}

describe("independent lifecycle residue probes", () => {
  it("requires supporting-store inventory at every exported target gate", () => {
    // @ts-expect-error supporting stores are a mandatory executor-gate input
    const omittedExecutorStores = () => compileLifecycleExecutionTargets(migrations, LIFECYCLE_REGISTRY, ROW_CLASS_INVENTORY, JSON_PATH_INVENTORY, SUBJECTS);
    // @ts-expect-error supporting stores are a mandatory independent-probe input
    const omittedProbeStores = () => deriveExpectedResidueProbes(migrations, LIFECYCLE_REGISTRY, ROW_CLASS_INVENTORY, JSON_PATH_INVENTORY, SUBJECTS);
    void omittedExecutorStores;
    void omittedProbeStores;
    expect(SUPPORTING_LIFECYCLE_STORES.length).toBeGreaterThan(0);
  });

  it("derives a complete executable target identity independently of executors", () => {
    const expected = expectedTargets();
    const targets = executorTargets();
    expect(expected).toHaveLength(LIFECYCLE_REGISTRY.length + SUPPORTING_LIFECYCLE_STORES.length);
    expect(new Set(expected.map((item) => item.registryKey)).size).toBe(expected.length);
    expect(expected.find((item) => item.registryKey === "stripe_events::stripe_workspace_attributed::provider_payload")?.columns).toEqual(["payload"]);
    expect(expected.find((item) => item.table === "brain_docs")?.jsonPaths).toContain("source_evidence$[*].inputId");
    expect(expected.find((item) => item.registryKey === "supporting::pgboss.job")?.columns).toEqual(expect.arrayContaining(["data", "output"]));
    expect(() => assertProbeClosure(expected, LIFECYCLE_PROBES)).not.toThrow();
    expect(() => assertExecutorProbeAgreement(targets, expected)).not.toThrow();

    const consent = targets.find((item) => item.registryKey === "trend_transcripts::creator_consent::complete_row")!;
    expect(consent.subject).toEqual(SUBJECTS.identity);
    expect(consent.subjectPredicate).toEqual({
      kind: "direct",
      matches: [{ column: "rights_subject_user_id", subjectField: "userId" }],
    });
    expect(targets.find((item) => item.table === "brain_docs")?.subjectPredicate.kind).toBe("composite");
    expect(targets.find((item) => item.table === "user")?.subjectPredicate).toEqual({
      kind: "direct",
      matches: [{ column: "id", subjectField: "authUserId" }],
    });
    expect(targets.find((item) => item.table === "users")?.subjectPredicate).toEqual({
      kind: "direct",
      matches: [{ column: "id", subjectField: "userId" }],
    });
    expect(targets.find((item) => item.table === "verification")?.subjectPredicate).toEqual({
      kind: "snapshot_pairs",
      identifierColumn: "identifier",
      valueColumn: "value",
      subjectField: "verificationRows",
    });
    const customerReceipt = targets.find((item) => item.registryKey === "stripe_events::stripe_customer_attributed::provider_payload")!;
    expect(customerReceipt.subject).toEqual(SUBJECTS.system);
    expect(customerReceipt.subjectPredicate.kind).toBe("unscoped");
    expect(targets.find((item) => item.registryKey === "stripe_events::stripe_workspace_attributed::provider_payload")?.subjectPredicate.kind).toBe("snapshot_indirect");
    const pgBossJob = targets.find((item) => item.registryKey === "supporting::pgboss.job")!;
    expect(pgBossJob.subject.scope).toBe("related");
    expect(pgBossJob.subjectPredicate.kind).toBe("snapshot_indirect");
    expect(pgBossJob.jsonPaths).toEqual([
      "data$.attemptId", "data$.autopsyCacheClaimId", "data$.itemId", "data$.jobId", "data$.runId",
    ]);
    expect(pgBossJob.subject).toEqual({
      scope: "related",
      activeScope: "profile",
      activeSubject: SUBJECTS.profile,
    });
    const pgBossSchedule = targets.find((item) => item.registryKey === "supporting::pgboss.schedule")!;
    expect(pgBossSchedule).toMatchObject({ action: "not_applicable", selector: { retention: "installation_lifetime" } });
    expect(pgBossSchedule.subjectPredicate.kind).toBe("unscoped");
  });

  it("reddens when an independent probe capability is absent", () => {
    const expected = expectedTargets();
    const { stripe_payload_residue: _missing, ...probes } = LIFECYCLE_PROBES;
    void _missing;
    expect(() => assertProbeClosure(expected, probes)).toThrow(/missing independent probe 'stripe_payload_residue'/);
  });

  it("reddens independently for every executor/probe identity drift dimension", () => {
    const expected = expectedTargets();
    const targets = executorTargets();
    const first = targets[0];
    expect(() => assertExecutorProbeAgreement(targets.slice(1), expected)).toThrow(/independent probe has no executor target/);

    const mutations: readonly Readonly<{
      label: string;
      key: string;
      pattern: RegExp;
      mutate(target: LifecycleExecutionTarget): LifecycleExecutionTarget;
    }>[] = [
      { label: "resource", key: first.registryKey, pattern: /resource-kind disagreement/, mutate: (target) => ({ ...target, resourceKind: "supporting_store" }) },
      { label: "table", key: first.registryKey, pattern: /table disagreement/, mutate: (target) => ({ ...target, table: "wrong_table" }) },
      { label: "row class", key: first.registryKey, pattern: /row-class disagreement/, mutate: (target) => ({ ...target, rowClass: "wrong_row_class" }) },
      { label: "action", key: first.registryKey, pattern: /action disagreement/, mutate: (target) => ({ ...target, action: "not_applicable" }) },
      { label: "executor", key: first.registryKey, pattern: /executor disagreement/, mutate: (target) => ({ ...target, executor: "system_retention" }) },
      { label: "probe", key: first.registryKey, pattern: /probe disagreement/, mutate: (target) => ({ ...target, probe: "system_residue" }) },
      { label: "field", key: first.registryKey, pattern: /field disagreement/, mutate: (target) => ({ ...target, columns: [] }) },
      {
        label: "foreign key",
        key: targets.find((target) => target.foreignKeyColumns.length > 0)!.registryKey,
        pattern: /foreign-key disagreement/,
        mutate: (target) => ({ ...target, foreignKeyColumns: [] }),
      },
      {
        label: "foreign key edge",
        key: targets.find((target) => target.foreignKeys.length > 0)!.registryKey,
        pattern: /foreign-key-edge disagreement/,
        mutate: (target) => ({ ...target, foreignKeys: [] }),
      },
      {
        label: "JSON path",
        key: targets.find((target) => target.jsonPaths.length > 0)!.registryKey,
        pattern: /JSON-path disagreement/,
        mutate: (target) => ({ ...target, jsonPaths: [] }),
      },
      { label: "selector", key: first.registryKey, pattern: /selector disagreement/, mutate: (target) => ({ ...target, selector: { ...target.selector, retention: "library_lifetime" } }) },
      {
        label: "discriminator operator",
        key: targets.find((target) => target.registryKey === "stripe_events::stripe_customer_attributed::provider_payload")!.registryKey,
        pattern: /selector disagreement/,
        mutate: (target) => ({ ...target, selector: { ...target.selector, discriminator: { ...target.selector.discriminator!, operator: "is_null", value: null } } }),
      },
      {
        label: "discriminator value",
        key: targets.find((target) => target.registryKey === "stripe_events::stripe_customer_attributed::provider_payload")!.registryKey,
        pattern: /selector disagreement/,
        mutate: (target) => ({ ...target, selector: { ...target.selector, discriminator: { ...target.selector.discriminator!, value: "workspace_attributed" } } }),
      },
      {
        label: "subject",
        key: first.registryKey,
        pattern: /subject disagreement/,
        mutate: (target) => ({
          ...target,
          subject: {
            scope: "identity",
            userId: "wrong_domain_user",
            authUserId: "wrong_auth_user",
            verificationRows: SUBJECTS.identity.verificationRows,
          },
        }),
      },
      {
        label: "subject predicate",
        key: first.registryKey,
        pattern: /subject-predicate disagreement/,
        mutate: (target) => ({ ...target, subjectPredicate: { kind: "direct", matches: [{ column: "wrong_column", subjectField: "userId" }] } }),
      },
    ];
    for (const mutation of mutations) {
      expect(
        () => assertExecutorProbeAgreement(replaceTarget(targets, mutation.key, mutation.mutate), expected),
        `${mutation.label} drift stayed green`
      ).toThrow(mutation.pattern);
    }
  });

  it("requires nonblank typed runtime subjects", () => {
    const blankIdentity = {
      ...SUBJECTS,
      identity: { ...SUBJECTS.identity, userId: " " },
    } as const satisfies LifecycleRuntimeSubjects;
    expect(() => compileLifecycleExecutionTargets(
      migrations,
      LIFECYCLE_REGISTRY,
      ROW_CLASS_INVENTORY,
      JSON_PATH_INVENTORY,
      blankIdentity,
      SUPPORTING_LIFECYCLE_STORES
    )).toThrow(/runtime lifecycle subject has blank userId/);

    const blankAuthIdentity = {
      ...SUBJECTS,
      identity: { ...SUBJECTS.identity, authUserId: " " },
    } as const satisfies LifecycleRuntimeSubjects;
    expect(() => compileLifecycleExecutionTargets(
      migrations,
      LIFECYCLE_REGISTRY,
      ROW_CLASS_INVENTORY,
      JSON_PATH_INVENTORY,
      blankAuthIdentity,
      SUPPORTING_LIFECYCLE_STORES
    )).toThrow(/runtime lifecycle subject has blank authUserId/);

    const wrongResetValue = {
      ...SUBJECTS,
      identity: {
        ...SUBJECTS.identity,
        verificationRows: [{
          kind: "password_reset",
          identifier: "reset-password:123456789012345678901234",
          value: "another_auth_user",
        }],
      },
    } as const satisfies LifecycleRuntimeSubjects;
    expect(() => compileLifecycleExecutionTargets(
      migrations,
      LIFECYCLE_REGISTRY,
      ROW_CLASS_INVENTORY,
      JSON_PATH_INVENTORY,
      wrongResetValue,
      SUPPORTING_LIFECYCLE_STORES
    )).toThrow(/invalid Better Auth password-reset snapshot/);

    const wrongOAuthLink = {
      ...SUBJECTS,
      identity: {
        ...SUBJECTS.identity,
        verificationRows: [{
          kind: "oauth_account_link",
          identifier: "12345678901234567890123456789012",
          value: JSON.stringify({ link: { userId: "another_auth_user" } }),
        }],
      },
    } as const satisfies LifecycleRuntimeSubjects;
    expect(() => compileLifecycleExecutionTargets(
      migrations,
      LIFECYCLE_REGISTRY,
      ROW_CLASS_INVENTORY,
      JSON_PATH_INVENTORY,
      wrongOAuthLink,
      SUPPORTING_LIFECYCLE_STORES
    )).toThrow(/invalid Better Auth OAuth-state snapshot/);
  });

  it("keeps snapshot predicates targetable after source rows and foreign keys disappear", () => {
    const targets = executorTargets();
    const verification = targets.find((target) => target.table === "verification")!;
    expect(lifecycleTargetMatchesRow(verification, {
      identifier: SUBJECTS.identity.verificationRows[0].identifier,
      value: SUBJECTS.identity.verificationRows[0].value,
    })).toBe(true);
    expect(lifecycleTargetMatchesRow(verification, {
      identifier: SUBJECTS.identity.verificationRows[0].identifier,
      value: "another_auth_user",
    })).toBe(false);

    const stripe = targets.find((target) =>
      target.registryKey === "stripe_events::stripe_workspace_attributed::provider_payload"
    )!;
    expect(lifecycleTargetMatchesRow(stripe, {
      id: SUBJECTS.workspace.stripeEventIds[0],
      workspace_id: null,
      receipt_attribution: "workspace_attributed",
    })).toBe(true);
    expect(lifecycleTargetMatchesRow(stripe, {
      id: "evt_other_workspace",
      workspace_id: null,
      receipt_attribution: "workspace_attributed",
    })).toBe(false);

    const spend = targets.find((target) =>
      target.registryKey === "system_model_usage::system_row::linkable_source_ids"
    )!;
    expect(lifecycleTargetMatchesRow(spend, {
      trend_item_id: SUBJECTS.profile.sourceIds.trendItemIds[0],
    })).toBe(true);
    expect(lifecycleTargetMatchesRow(spend, { trend_item_id: "trend_deleted_elsewhere" })).toBe(false);

    const pgBoss = targets.find((target) => target.registryKey === "supporting::pgboss.job")!;
    expect(lifecycleTargetMatchesRow(pgBoss, {
      id: "unrelated_job_row",
      data: { itemId: SUBJECTS.profile.sourceIds.trendItemIds[0] },
    })).toBe(true);
    expect(lifecycleTargetMatchesRow(pgBoss, {
      id: "unrelated_job_row",
      data: { runId: SUBJECTS.profile.sourceIds.jobAttemptIds[0] },
    })).toBe(true);
    expect(lifecycleTargetMatchesRow(pgBoss, {
      id: "unrelated_job_row",
      data: { runId: SUBJECTS.workspace.sourceIds.jobAttemptIds[0] },
    })).toBe(false);
    expect(lifecycleTargetMatchesRow(pgBoss, {
      id: "unrelated_job_row",
      data: { itemId: "trend_deleted_elsewhere" },
    })).toBe(false);
  });

  it("isolates indirect residue to the discriminated active operation subject", () => {
    const assertScope = (
      subjects: LifecycleRuntimeSubjects,
      acceptedId: string,
      refusedIds: readonly string[]
    ) => {
      const executor = executorTargets(subjects);
      const probes = expectedTargets(subjects);
      const spendKey = "system_model_usage::system_row::linkable_source_ids";
      const jobKey = "supporting::pgboss.job";
      const spendExecutor = executor.find((target) => target.registryKey === spendKey)!;
      const spendProbe = probes.find((target) => target.registryKey === spendKey)!;
      const jobExecutor = executor.find((target) => target.registryKey === jobKey)!;
      const jobProbe = probes.find((target) => target.registryKey === jobKey)!;

      expect(lifecycleTargetMatchesRow(spendExecutor, { trend_item_id: acceptedId })).toBe(true);
      expect(residueProbeMatchesRow(spendProbe, { trend_item_id: acceptedId })).toBe(true);
      expect(lifecycleTargetMatchesRow(jobExecutor, { data: { itemId: acceptedId } })).toBe(true);
      expect(residueProbeMatchesRow(jobProbe, { data: { itemId: acceptedId } })).toBe(true);
      for (const refusedId of refusedIds) {
        expect(lifecycleTargetMatchesRow(spendExecutor, { trend_item_id: refusedId })).toBe(false);
        expect(residueProbeMatchesRow(spendProbe, { trend_item_id: refusedId })).toBe(false);
        expect(lifecycleTargetMatchesRow(jobExecutor, { data: { itemId: refusedId } })).toBe(false);
        expect(residueProbeMatchesRow(jobProbe, { data: { itemId: refusedId } })).toBe(false);
      }
    };

    assertScope(
      SUBJECTS,
      SUBJECTS.profile.sourceIds.trendItemIds[0],
      [SUBJECTS.workspace.sourceIds.trendItemIds[0], "trend_sibling_profile"]
    );
    assertScope(
      WORKSPACE_SUBJECTS,
      SUBJECTS.workspace.sourceIds.trendItemIds[0],
      [SUBJECTS.profile.sourceIds.trendItemIds[0], "trend_other_workspace"]
    );

    const incoherent = {
      ...SUBJECTS,
      workspace: { ...SUBJECTS.workspace, workspaceId: "another_workspace" },
    } as const satisfies LifecycleRuntimeSubjects;
    expect(() => executorTargets(incoherent)).toThrow(/profile\/workspace subjects are incoherent/);
    expect(() => expectedTargets(incoherent)).toThrow(/profile\/workspace subjects are incoherent/);
  });

  it("drives every profile-scoped row by tenant ownership before colliding source snapshots", () => {
    const profileExecutors = executorTargets();
    const profileProbes = expectedTargets();
    const workspaceExecutors = executorTargets(WORKSPACE_SUBJECTS);
    const workspaceProbes = expectedTargets(WORKSPACE_SUBJECTS);
    const profileEntries = LIFECYCLE_REGISTRY.filter((entry) => entry.scope === "profile");
    expect(profileEntries.length).toBeGreaterThan(10);

    for (const entry of profileEntries) {
      const key = `${entry.table}::${entry.rowClass}::${entry.fieldSet.name}`;
      const profileExecutor = profileExecutors.find((target) => target.registryKey === key)!;
      const profileProbe = profileProbes.find((target) => target.registryKey === key)!;
      const workspaceExecutor = workspaceExecutors.find((target) => target.registryKey === key)!;
      const workspaceProbe = workspaceProbes.find((target) => target.registryKey === key)!;
      expect(profileExecutor.subjectPredicate.kind, `${key} profile operation`).toBe("composite");
      expect(profileProbe.subjectPredicate.kind, `${key} profile probe`).toBe("composite");
      expect(workspaceExecutor.subjectPredicate, `${key} workspace operation`).toEqual({
        kind: "direct",
        matches: [{ column: "workspace_id", subjectField: "workspaceId" }],
      });
      expect(workspaceProbe.subjectPredicate, `${key} workspace probe`).toEqual(workspaceExecutor.subjectPredicate);

      const tenantRow = (profileId: string, workspaceId: string) => withMatchingDiscriminator(
        profileExecutor,
        {
          id: profileId,
          profile_id: profileId,
          owner_profile_id: profileId,
          workspace_id: workspaceId,
          // Deliberately collides with the active profile source snapshot. It
          // must never override the row's tenant ownership.
          trend_item_id: SUBJECTS.profile.sourceIds.trendItemIds[0],
        }
      );
      const owned = tenantRow(SUBJECTS.profile.profileId, SUBJECTS.profile.workspaceId);
      const sibling = tenantRow("profile_lifecycle_sibling", SUBJECTS.profile.workspaceId);
      const foreign = tenantRow(SUBJECTS.profile.profileId, "workspace_lifecycle_foreign");

      expect(lifecycleTargetMatchesRow(profileExecutor, owned), `${key} owned executor row`).toBe(true);
      expect(residueProbeMatchesRow(profileProbe, owned), `${key} owned probe row`).toBe(true);
      expect(lifecycleTargetMatchesRow(profileExecutor, sibling), `${key} sibling executor row`).toBe(false);
      expect(residueProbeMatchesRow(profileProbe, sibling), `${key} sibling probe row`).toBe(false);
      expect(lifecycleTargetMatchesRow(profileExecutor, foreign), `${key} foreign executor row`).toBe(false);
      expect(residueProbeMatchesRow(profileProbe, foreign), `${key} foreign probe row`).toBe(false);

      expect(lifecycleTargetMatchesRow(workspaceExecutor, owned), `${key} workspace owned row`).toBe(true);
      expect(residueProbeMatchesRow(workspaceProbe, owned), `${key} workspace owned probe row`).toBe(true);
      expect(lifecycleTargetMatchesRow(workspaceExecutor, sibling), `${key} workspace sibling row`).toBe(true);
      expect(residueProbeMatchesRow(workspaceProbe, sibling), `${key} workspace sibling probe row`).toBe(true);
      expect(lifecycleTargetMatchesRow(workspaceExecutor, foreign), `${key} workspace foreign row`).toBe(false);
      expect(residueProbeMatchesRow(workspaceProbe, foreign), `${key} workspace foreign probe row`).toBe(false);
    }
  });

  it("targets cross-scope deletion requester links by the requester's identity", () => {
    const executors = executorTargets();
    const probes = expectedTargets();
    for (const key of [
      "deletion_operations::profile_row::requester_identity",
      "deletion_operations::workspace_row::requester_identity",
      "deletion_operation_transitions::profile_row::requester_identity",
      "deletion_operation_transitions::workspace_row::requester_identity",
    ]) {
      const executor = executors.find((target) => target.registryKey === key)!;
      const probe = probes.find((target) => target.registryKey === key)!;
      expect(executor.subjectPredicate, key).toEqual({
        kind: "direct",
        matches: [{ column: "requester_user_id", subjectField: "userId" }],
      });
      expect(probe.subjectPredicate, `${key} probe`).toEqual(executor.subjectPredicate);
      expect(
        lifecycleTargetMatchesRow(
          executor,
          withMatchingDiscriminator(executor, {
            requester_user_id: SUBJECTS.identity.userId,
          })
        ),
        `${key} owned row`
      ).toBe(true);
      expect(
        lifecycleTargetMatchesRow(
          executor,
          withMatchingDiscriminator(executor, {
            requester_user_id: "another_identity",
          })
        ),
        `${key} foreign row`
      ).toBe(false);
      expect(
        residueProbeMatchesRow(
          probe,
          withMatchingDiscriminator(probe, {
            requester_user_id: SUBJECTS.identity.userId,
          })
        ),
        `${key} residue`
      ).toBe(true);
    }
  });

  it("compiles the terminal request-session scrub without deleting receipt facts", () => {
    const executors = executorTargets();
    for (const rowClass of ["identity_row", "profile_row", "workspace_row"] as const) {
      const key = `deletion_operations::${rowClass}::recovery_secret`;
      const target = executors.find((candidate) => candidate.registryKey === key)!;
      expect(target.action, key).toBe("delete_explicit");
      expect(target.columns, key).toEqual([
        "recovery_secret_digest",
        "recovery_secret_prefix",
        "request_session_digest",
      ]);
      expect(target.columns, key).not.toContain("requester_digest");
      expect(target.columns, key).not.toContain("journal_version");
      expect(target.columns, key).not.toContain("state");
    }
  });

  it("applies row-class discriminators before executor or probe predicates", () => {
    const key = "stripe_events::stripe_customer_attributed::provider_payload";
    const executor = executorTargets().find((target) => target.registryKey === key)!;
    const probe = expectedTargets().find((target) => target.registryKey === key)!;
    const customerRow = { receipt_attribution: "customer_attributed" };
    const workspaceRow = { receipt_attribution: "workspace_attributed" };
    expect(executor.subjectPredicate.kind).toBe("unscoped");
    expect(lifecycleTargetMatchesRow(executor, customerRow)).toBe(true);
    expect(residueProbeMatchesRow(probe, customerRow)).toBe(true);
    expect(lifecycleTargetMatchesRow(executor, workspaceRow)).toBe(false);
    expect(residueProbeMatchesRow(probe, workspaceRow)).toBe(false);

    const wrongValue = {
      ...executor,
      selector: {
        ...executor.selector,
        discriminator: { ...executor.selector.discriminator!, value: "workspace_attributed" },
      },
    };
    expect(lifecycleTargetMatchesRow(wrongValue, customerRow)).toBe(false);
    expect(lifecycleTargetMatchesRow(wrongValue, workspaceRow)).toBe(true);
    const wrongOperator = {
      ...probe,
      selector: {
        ...probe.selector,
        discriminator: { ...probe.selector.discriminator!, operator: "is_null" as const, value: null },
      },
    };
    expect(residueProbeMatchesRow(wrongOperator, customerRow)).toBe(false);
    expect(residueProbeMatchesRow(wrongOperator, { receipt_attribution: null })).toBe(true);
  });

  it("executes probe and executor capabilities and rejects an incompatible executor", async () => {
    const expected = expectedTargets();
    const firstProbe = expected[0];
    await expect(
      LIFECYCLE_PROBES[firstProbe.probe].execute(
        { countResidual: async (target) => target.columns.length },
        firstProbe
      )
    ).resolves.toBe(firstProbe.columns.length);

    const brokenExecutors = {
      ...LIFECYCLE_EXECUTORS,
      profile_cascade: {
        ...LIFECYCLE_EXECUTORS.profile_cascade,
        supportedActions: ["not_applicable" as const],
      },
    };
    expect(() => compileLifecycleExecutionTargets(
      migrations,
      LIFECYCLE_REGISTRY,
      ROW_CLASS_INVENTORY,
      JSON_PATH_INVENTORY,
      SUBJECTS,
      SUPPORTING_LIFECYCLE_STORES,
      brokenExecutors
    )).toThrow(/executor\/action mismatch/);

    const expectedMethods: Readonly<Record<ExecutorId, string>> = {
      identity_cascade: "cascade",
      profile_cascade: "cascade",
      workspace_cascade: "cascade",
      explicit_row_delete: "deleteExplicit",
      workspace_pseudonymiser: "pseudonymise",
      identifier_scrubber: "pseudonymise",
      financial_retention_receiver: "retainFinancial",
      stripe_payload_receiver: "deleteExplicit",
      expiry_receiver: "deleteExplicit",
      external_deletion_receiver: "externalDelete",
      library_retention: "preserve",
      system_retention: "preserve",
    };
    const observed: string[] = [];
    const port = {
      cascade: async () => { observed.push("cascade"); },
      deleteExplicit: async () => { observed.push("deleteExplicit"); },
      pseudonymise: async () => { observed.push("pseudonymise"); },
      retainFinancial: async () => { observed.push("retainFinancial"); },
      externalDelete: async () => { observed.push("externalDelete"); },
      preserve: async () => { observed.push("preserve"); },
    };
    const target = executorTargets()[0];
    for (const [id, implementation] of Object.entries(LIFECYCLE_EXECUTORS) as [ExecutorId, (typeof LIFECYCLE_EXECUTORS)[ExecutorId]][]) {
      observed.length = 0;
      await implementation.execute(port, { ...target, executor: id });
      expect(observed, `${id} calls the wrong mutation port`).toEqual([expectedMethods[id]]);
    }
  });
});
