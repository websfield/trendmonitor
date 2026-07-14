using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Events;

namespace UgcIntelligence.C2.Api.Verdicts;

/// <summary>
/// REQ-017, P1-T6. A manager can override any verdict. The override is a <strong>compensating
/// event</strong>, never a delete: the original <c>VerdictIssued</c> stays in the append-only log and
/// a <c>VerdictOverridden</c> is emitted beside it, recording the original verdict, the override, the
/// reason, and the reviewer's identity.
///
/// <para>Overrides are a first-class calibration input, not an exception path — a cohort where
/// managers override 40% of verdicts is a cohort where the rubric is wrong, and C3 reads these events
/// to notice that.</para>
/// </summary>
public sealed class OverrideService(ComplianceEventEmitter emitter)
{
    /// <summary>
    /// Override <paramref name="originalVerdict"/> with <paramref name="overrideVerdict"/>. A reason and
    /// a reviewer id are required — an override with neither is not a decision anyone can audit.
    ///
    /// <para>REQ-021/REQ-017 (audit finding #1): an override into <see cref="Verdict.APPROVED"/> is a human
    /// approval and is held to the same bar. The caller supplies the live <paramref name="compliance"/>
    /// result and the real human-click timestamp <paramref name="humanApprovedAt"/>, and this service passes
    /// both straight through — it pre-computes <strong>no</strong> veto flag. The live veto re-check is
    /// computed at the persistence boundary (<see cref="ComplianceEventEmitter.EmitVerdictOverriddenAsync"/>)
    /// from the passed <paramref name="compliance"/> result, so a caller can neither omit nor falsify it: the
    /// boundary rejects an APPROVED override with a null timestamp or a fired/unevaluable veto, and the
    /// invariant holds even for a caller that bypasses this service.</para>
    /// </summary>
    public Task<Guid> OverrideAsync(
        Guid submissionId,
        Guid tenantId,
        Verdict originalVerdict,
        Verdict overrideVerdict,
        string reason,
        string reviewerId,
        ComplianceResult compliance,
        DateTimeOffset? humanApprovedAt,
        DateTimeOffset occurredAt,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(reason))
            throw new ArgumentException("An override must record a reason.", nameof(reason));
        if (string.IsNullOrWhiteSpace(reviewerId))
            throw new ArgumentException("An override must record the reviewer's identity.", nameof(reviewerId));

        // The live veto re-check is computed at the persistence boundary from this same ComplianceResult;
        // the service passes it through rather than pre-computing a flag the boundary would have to trust.
        return emitter.EmitVerdictOverriddenAsync(
            new VerdictOverriddenRecord(submissionId, tenantId, originalVerdict, overrideVerdict, reason, reviewerId,
                occurredAt, humanApprovedAt),
            compliance, ct);
    }
}
