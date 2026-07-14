using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Scoring;
using UgcIntelligence.C2.Api.Verdicts;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;
using UgcIntelligence.Events;
using UgcIntelligence.Events.Writer;

namespace UgcIntelligence.C2.Api.Events;

/// <summary>Thrown at the persistence boundary when an APPROVED verdict lacks a real human click.</summary>
public sealed class AutoApprovalRejectedException(Guid submissionId)
    : InvalidOperationException(
        $"REQ-021: submission {submissionId} cannot be recorded as APPROVED with a null human_approved_at. "
        + "Every APPROVED requires a real human click. There is no auto-approval path.");

/// <summary>
/// Thrown at a persistence boundary when a submission is recorded as APPROVED over a live veto — a veto
/// that fired or could not be evaluated. Both APPROVED-emitting boundaries throw this: an override into
/// APPROVED (<see cref="ComplianceEventEmitter.EmitVerdictOverriddenAsync"/>) and a direct APPROVED verdict
/// carrying fired vetoes (<see cref="ComplianceEventEmitter.EmitVerdictIssuedAsync"/>). A veto is not
/// something an approval or an override clears silently (REQ-017/REQ-021).
/// </summary>
public sealed class OverrideOverLiveVetoRejectedException(Guid submissionId)
    : InvalidOperationException(
        $"REQ-017/REQ-021: submission {submissionId} cannot be recorded as APPROVED while a veto is fired or "
        + "unevaluable. The persistence boundary re-checks live compliance; a blocking veto is never cleared "
        + "by an approval or an override.");

/// <summary>
/// The data recorded on a <c>VerdictIssued</c> event (Contract B). <see cref="DecidedBy"/> is the fixed
/// constant <c>deterministic_verdict_engine</c>: the verdict came from the pure engine, never a model.
///
/// <para><see cref="SuspectedVetoes"/> is model-raised and <strong>surfaced only</strong>. It rides on
/// the event for a human's attention; it was never read by the veto or verdict computation that
/// produced <see cref="Verdict"/> and <see cref="VetoesFired"/>.</para>
/// </summary>
public sealed record VerdictIssuedRecord(
    Guid SubmissionId,
    Guid TenantId,
    Verdict Verdict,
    IReadOnlyList<string> VetoesFired,
    IReadOnlyList<SuspectedVeto> SuspectedVetoes,
    DateTimeOffset? HumanApprovedAt,
    DateTimeOffset OccurredAt,
    bool HookGateFired = false)
{
    public const string DecidedBy = "deterministic_verdict_engine";
}

/// <summary>
/// The data recorded on a <c>VerdictOverridden</c> event (Contract B, REQ-017). A compensating event,
/// never a delete: the original verdict stays in the log and the override sits beside it.
///
/// <para>REQ-021 (audit finding #1): <see cref="HumanApprovedAt"/> is the real human-click timestamp,
/// non-null only for an override into <see cref="Verdict.APPROVED"/> (a human approval), null otherwise.
/// The live veto re-check is <strong>not</strong> a field on this record — it is computed at the
/// persistence boundary from the <c>ComplianceResult</c> passed to <c>EmitVerdictOverriddenAsync</c>, so a
/// caller can neither omit nor falsify it. The boundary rejects an APPROVED override with a null timestamp
/// or a fired/unevaluable veto, and the invariant holds even for a caller that bypasses
/// <c>OverrideService</c>.</para>
/// </summary>
public sealed record VerdictOverriddenRecord(
    Guid SubmissionId,
    Guid TenantId,
    Verdict OriginalVerdict,
    Verdict OverrideVerdict,
    string Reason,
    string ReviewerId,
    DateTimeOffset OccurredAt,
    DateTimeOffset? HumanApprovedAt = null);

/// <summary>
/// The data recorded on a <c>SubmissionScored</c> event (Contract B). Every produced score pins its
/// <see cref="VersionTriple"/> and <see cref="BreakerState"/> — re-running the score against the same
/// triple yields the same number, and the breaker state at score time travels with the score rather than
/// being reconstructed from flag history. Every VPS is <c>Estimated</c> provenance.
///
/// <para><see cref="Anomalous"/> marks a clamped out-of-range model score: it is stored, and consumers
/// exclude it from the calibration dataset.</para>
/// </summary>
public sealed record SubmissionScoredRecord(
    Guid SubmissionId,
    Guid TenantId,
    Guid FeatureRecordId,
    CohortKey CohortKey,
    VersionTriple VersionTriple,
    BreakerState BreakerState,
    decimal Vps,
    decimal Bas,
    IReadOnlyDictionary<string, CriterionScore> Criteria,
    bool Anomalous,
    bool AudioPresent,
    DateTimeOffset OccurredAt);

/// <summary>
/// P1-T8 / P3-T5. Builds and appends the Gate A events (<c>SubmissionScored</c>, <c>VerdictIssued</c>,
/// <c>VerdictOverridden</c>) through the sole <see cref="IOutcomeEventWriter"/>. C2 is the only writer of
/// this stream.
///
/// <para>This is the persistence boundary that enforces REQ-021: an APPROVED verdict with a null
/// <c>human_approved_at</c> is rejected here, before any event is appended. If the append itself fails,
/// the exception propagates to the caller — the verdict is <strong>not</strong> issued, and no verdict
/// whose event was dropped is ever considered recorded. The append is idempotent, so a retry is safe.</para>
/// </summary>
public sealed class ComplianceEventEmitter(IOutcomeEventWriter writer)
{
    public async Task<Guid> EmitSubmissionScoredAsync(SubmissionScoredRecord record, CancellationToken ct = default)
    {
        var payload = new Dictionary<string, object?>
        {
            ["submission_id"] = record.SubmissionId,
            ["feature_record_id"] = record.FeatureRecordId,
            ["cohort_key"] = new Dictionary<string, object?>
            {
                ["tenant_id"] = record.CohortKey.TenantId,
                ["vertical"] = record.CohortKey.Vertical,
                ["platform"] = record.CohortKey.Platform,
                ["rubric_version"] = record.CohortKey.RubricVersion,
                ["pattern_library_version"] = record.CohortKey.PatternLibraryVersion,
            },
            ["version_triple"] = new Dictionary<string, object?>
            {
                ["extractor_version"] = record.VersionTriple.ExtractorVersion,
                ["rubric_version"] = record.VersionTriple.RubricVersion,
                ["pattern_library_version"] = record.VersionTriple.PatternLibraryVersion,
            },
            ["breaker_state_at_score"] = record.BreakerState.ToString().ToLowerInvariant(),
            ["vps"] = record.Vps,
            ["bas"] = record.Bas,
            ["criteria"] = record.Criteria.ToDictionary(
                kv => kv.Key,
                kv => (object?)new Dictionary<string, object?>
                {
                    ["score"] = kv.Value.Score,
                    ["degraded"] = kv.Value.Degraded,
                    ["evidence"] = kv.Value.Evidence,
                }),
            ["anomalous"] = record.Anomalous,
            ["audio_present"] = record.AudioPresent,
            ["provenance"] = "Estimated",
        };

        var e = new OutcomeEvent(
            EventId: Guid.NewGuid(),
            EventType: OutcomeEventType.SubmissionScored,
            IdempotencyKey: OutcomeEvent.ComputeIdempotencyKey(
                OutcomeEventType.SubmissionScored, record.SubmissionId, record.OccurredAt),
            TenantId: record.TenantId,
            OccurredAt: record.OccurredAt,
            RecordedAt: DateTimeOffset.UtcNow,
            Payload: payload);

        return await writer.AppendAsync(e, ct);
    }

    public async Task<Guid> EmitVerdictIssuedAsync(VerdictIssuedRecord record, CancellationToken ct = default)
    {
        // Persistence boundary. No configuration disables these checks.
        if (record.Verdict == Verdict.APPROVED && record.HumanApprovedAt is null)
            throw new AutoApprovalRejectedException(record.SubmissionId);

        // Symmetric to EmitVerdictOverriddenAsync: an APPROVED verdict can never carry a fired veto. A clean
        // approval always has empty VetoesFired (ApprovalService blocks over a fired/unevaluable veto before
        // emitting), so this never false-positives — it closes the same defence-in-depth hole on the issue
        // side, rejecting a caller that bypasses ApprovalService with APPROVED + a live veto.
        if (record.Verdict == Verdict.APPROVED && record.VetoesFired.Count > 0)
            throw new OverrideOverLiveVetoRejectedException(record.SubmissionId);

        var payload = new Dictionary<string, object?>
        {
            ["submission_id"] = record.SubmissionId,
            ["verdict"] = record.Verdict.ToString(),
            ["vetoes_fired"] = record.VetoesFired,
            ["suspected_vetoes"] = record.SuspectedVetoes
                .Select(s => new Dictionary<string, object?> { ["veto_id"] = s.VetoId, ["rationale"] = s.Rationale })
                .ToList(),
            ["decided_by"] = VerdictIssuedRecord.DecidedBy,
            ["human_approved_at"] = record.HumanApprovedAt,
            // #19: sourced from the record, whose value is computed via VerdictEngine.HookGateFired —
            // the single source of truth for the hook < 50 branch that VerdictEngine.Resolve also uses.
            ["hook_gate_fired"] = record.HookGateFired,
        };

        var e = new OutcomeEvent(
            EventId: Guid.NewGuid(),
            EventType: OutcomeEventType.VerdictIssued,
            IdempotencyKey: OutcomeEvent.ComputeIdempotencyKey(
                OutcomeEventType.VerdictIssued, record.SubmissionId, record.OccurredAt),
            TenantId: record.TenantId,
            OccurredAt: record.OccurredAt,
            RecordedAt: DateTimeOffset.UtcNow,
            Payload: payload);

        return await writer.AppendAsync(e, ct);
    }

    public async Task<Guid> EmitVerdictOverriddenAsync(
        VerdictOverriddenRecord record, ComplianceResult compliance, CancellationToken ct = default)
    {
        // Persistence boundary, REQ-021/REQ-017 (audit finding #1). No configuration disables either check.
        // An override into APPROVED is a human approval: it requires a real human click, and it may not
        // approve over a veto that fired or could not be evaluated. The veto re-check is computed HERE from
        // the live ComplianceResult — never trusted from a caller-supplied flag — so a caller that bypasses
        // OverrideService can neither record an auto-approval nor launder a fired/unevaluable veto.
        if (record.OverrideVerdict == Verdict.APPROVED)
        {
            if (record.HumanApprovedAt is null)
                throw new AutoApprovalRejectedException(record.SubmissionId);
            if (compliance.AnyFired || compliance.AnyUnevaluable)
                throw new OverrideOverLiveVetoRejectedException(record.SubmissionId);
        }

        var payload = new Dictionary<string, object?>
        {
            ["submission_id"] = record.SubmissionId,
            ["original_verdict"] = record.OriginalVerdict.ToString(),
            ["override_verdict"] = record.OverrideVerdict.ToString(),
            ["reason"] = record.Reason,
            ["reviewer_id"] = record.ReviewerId,
            ["human_approved_at"] = record.HumanApprovedAt,
        };

        var e = new OutcomeEvent(
            EventId: Guid.NewGuid(),
            EventType: OutcomeEventType.VerdictOverridden,
            IdempotencyKey: OutcomeEvent.ComputeIdempotencyKey(
                OutcomeEventType.VerdictOverridden, record.SubmissionId, record.OccurredAt),
            TenantId: record.TenantId,
            OccurredAt: record.OccurredAt,
            RecordedAt: DateTimeOffset.UtcNow,
            Payload: payload);

        return await writer.AppendAsync(e, ct);
    }
}
