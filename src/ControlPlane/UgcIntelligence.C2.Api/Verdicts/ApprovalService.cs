using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Events;

namespace UgcIntelligence.C2.Api.Verdicts;

/// <summary>
/// REQ-021, P1-T5. The human-approval action. There is no <c>AutoApprove</c> flag, no
/// <c>bulkApprove</c>, and no path that defaults <c>human_approved_at</c> to the current time: a
/// caller must supply the real timestamp of a real click, together with the reviewer's identity.
///
/// <para>The service issues verdicts through <see cref="ComplianceEventEmitter"/>, which is the
/// persistence boundary. An APPROVED verdict without a human click is rejected there, so the
/// invariant holds even if a future caller bypasses this service.</para>
/// </summary>
public sealed class ApprovalService(ComplianceEventEmitter emitter)
{
    /// <summary>
    /// Record a non-approval verdict (REJECTED, REVISIONS_REQUIRED, NEEDS_REVIEW,
    /// EXCLUDED_FROM_AI_SCORING, or APPROVED_WITH_NOTES). These carry a null <c>human_approved_at</c>:
    /// they are the deterministic engine's output, not a human approval.
    ///
    /// <para>#19: <paramref name="scores"/> is the deterministic criterion-number vector the verdict was
    /// resolved from (null for a pre-scoring compliance verdict, e.g. a fired-veto REJECTED). It is used
    /// only to populate <c>hook_gate_fired</c> via the single-source <see cref="VerdictEngine.HookGateFired"/>
    /// predicate — so a REVISIONS_REQUIRED forced by <c>hook &lt; 50</c> carries <c>hook_gate_fired = true</c>
    /// for the C1/C3 calibration consumer, while a BAS-floor revise or an unscored hold carries false. The
    /// scores are never re-scored here and never influence the verdict, which is passed in already resolved.</para>
    /// </summary>
    public Task<Guid> IssueAsync(
        Guid submissionId,
        Guid tenantId,
        Verdict verdict,
        ComplianceResult compliance,
        IReadOnlyDictionary<string, decimal>? scores,
        IReadOnlyList<SuspectedVeto> suspectedVetoes,
        DateTimeOffset occurredAt,
        CancellationToken ct = default)
    {
        if (verdict == Verdict.APPROVED)
            throw new AutoApprovalRejectedException(submissionId);   // APPROVED must go through RecordHumanApproval

        return emitter.EmitVerdictIssuedAsync(
            new VerdictIssuedRecord(submissionId, tenantId, verdict, compliance.FiredIds, suspectedVetoes,
                HumanApprovedAt: null, occurredAt, HookGateFired: VerdictEngine.HookGateFired(scores)),
            ct);
    }

    /// <summary>
    /// Record an APPROVED verdict from a real human click. <paramref name="humanApprovedAt"/> is the
    /// click's timestamp, supplied by the caller — never defaulted.
    ///
    /// <para>REQ-021 (audit finding #11): the submission must have cleared <strong>both</strong> gates the
    /// deterministic engine applies. First compliance — no fired or unevaluable veto; approving over a live
    /// veto is an override, a separate recorded act, not an approval. Second the scoring ladder — the
    /// pre-state accepted for a human approval is exactly the deterministic engine's own eligible-to-approve
    /// output: <see cref="VerdictEngine.Resolve"/> must resolve to <see cref="Verdict.APPROVED"/> or
    /// <see cref="Verdict.APPROVED_WITH_NOTES"/> (the clean-but-vps&lt;70 outcome). A submission the engine
    /// would route to REVISIONS_REQUIRED (bas&lt;60 or hook&lt;50) or NEEDS_REVIEW (unscored) cannot be
    /// human-approved: a human click is not a bypass of the scoring ladder.</para>
    /// </summary>
    public Task<Guid> RecordHumanApprovalAsync(
        Guid submissionId,
        Guid tenantId,
        ComplianceResult compliance,
        decimal? bas,
        IReadOnlyDictionary<string, decimal>? scores,
        IReadOnlyList<SuspectedVeto> suspectedVetoes,
        DateTimeOffset humanApprovedAt,
        DateTimeOffset occurredAt,
        CancellationToken ct = default)
    {
        if (compliance.AnyFired || compliance.AnyUnevaluable)
            throw new InvalidOperationException(
                $"Submission {submissionId} has a fired or unevaluable veto and cannot be APPROVED. "
                + "A veto is not something a human approval clears — an override is a separate, recorded act.");

        // #11: assert the deterministic BAS/hook scoring ladder cleared, not only the compliance vetoes.
        var resolved = VerdictEngine.Resolve(compliance, bas, scores);
        if (resolved is not (Verdict.APPROVED or Verdict.APPROVED_WITH_NOTES))
            throw new InvalidOperationException(
                $"Submission {submissionId} did not clear the deterministic BAS/hook scoring ladder "
                + $"(engine verdict: {resolved}) and cannot be human-approved. Only a submission the engine "
                + "resolves to APPROVED or APPROVED_WITH_NOTES is eligible for a human approval click — a human "
                + "click is not a bypass of the scoring ladder.");

        return emitter.EmitVerdictIssuedAsync(
            new VerdictIssuedRecord(submissionId, tenantId, Verdict.APPROVED, compliance.FiredIds, suspectedVetoes,
                HumanApprovedAt: humanApprovedAt, occurredAt, HookGateFired: VerdictEngine.HookGateFired(scores)),
            ct);
    }
}
