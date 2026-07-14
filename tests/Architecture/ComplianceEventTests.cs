using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Events;
using UgcIntelligence.C2.Api.Scoring;
using UgcIntelligence.C2.Api.Verdicts;
using UgcIntelligence.Events;
using UgcIntelligence.Events.Writer;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>An event writer that always fails, to prove a dropped event never becomes an issued verdict.</summary>
internal sealed class ThrowingEventWriter : IOutcomeEventWriter
{
    public int Attempts { get; private set; }
    public Task<Guid> AppendAsync(OutcomeEvent e, CancellationToken ct = default)
    {
        Attempts++;
        throw new IOException("event store down");
    }
}

/// <summary>
/// A4 (persistence boundary), plus the event-log and extraction failure modes. These exercise the
/// emitter — the only path that appends a compliance verdict to the append-only log.
/// </summary>
public sealed class ApprovalTests
{
    private static (ComplianceEventEmitter emitter, AppendOnlyEventLog log) NewEmitter()
    {
        var log = new AppendOnlyEventLog();
        return (new ComplianceEventEmitter(new OutcomeEventWriter(log)), log);
    }

    private static ComplianceResult CleanCompliance() => new(Phase1Fixtures.AllPass());

    /// <summary>A clean-pass criteria vector: every VPS criterion at 85 (hook 85 ≥ 50, VPS 85 ≥ 70 ⇒ APPROVED).</summary>
    private static Dictionary<string, decimal> ClearingScores() =>
        Composition.VpsWeights.Keys.ToDictionary(k => k, _ => 85m);

    /// <summary>A4. APPROVED with a null human_approved_at is rejected at the persistence boundary.</summary>
    [Fact]
    public async Task Approved_WithoutHumanClick_IsRejected()
    {
        var (emitter, log) = NewEmitter();
        var record = new VerdictIssuedRecord(
            Guid.NewGuid(), Phase1Fixtures.Tenant, Verdict.APPROVED,
            VetoesFired: [], SuspectedVetoes: [], HumanApprovedAt: null, OccurredAt: Phase1Fixtures.Now);

        await Assert.ThrowsAsync<AutoApprovalRejectedException>(() => emitter.EmitVerdictIssuedAsync(record));
        Assert.Equal(0, log.Count);   // nothing was written
    }

    /// <summary>APPROVED with a real human click is recorded, carrying the timestamp and decided_by constant.</summary>
    [Fact]
    public async Task Approved_WithHumanClick_IsRecorded()
    {
        var (emitter, log) = NewEmitter();
        var approvedAt = Phase1Fixtures.Now.AddMinutes(3);
        var record = new VerdictIssuedRecord(
            Guid.NewGuid(), Phase1Fixtures.Tenant, Verdict.APPROVED,
            VetoesFired: [], SuspectedVetoes: [], HumanApprovedAt: approvedAt, OccurredAt: Phase1Fixtures.Now);

        await emitter.EmitVerdictIssuedAsync(record);
        Assert.Equal(1, log.Count);

        var e = await Single(log);
        Assert.Equal("APPROVED", e.Payload["verdict"]);
        Assert.Equal("deterministic_verdict_engine", e.Payload["decided_by"]);
        Assert.Equal(approvedAt, e.Payload["human_approved_at"]);
    }

    /// <summary>ApprovalService.RecordHumanApproval never defaults the timestamp — the caller supplies the click.</summary>
    [Fact]
    public async Task ApprovalService_RecordsSuppliedTimestamp_NeverDefaults()
    {
        var (emitter, log) = NewEmitter();
        var service = new ApprovalService(emitter);
        var clickAt = Phase1Fixtures.Now.AddMinutes(5);

        await service.RecordHumanApprovalAsync(Guid.NewGuid(), Phase1Fixtures.Tenant, CleanCompliance(),
            bas: 90m, scores: ClearingScores(), suspectedVetoes: [], humanApprovedAt: clickAt, occurredAt: Phase1Fixtures.Now);

        var e = await Single(log);
        Assert.Equal(clickAt, e.Payload["human_approved_at"]);
    }

    /// <summary>ApprovalService.Issue refuses to issue APPROVED — that path requires a recorded human click.</summary>
    [Fact]
    public async Task ApprovalService_Issue_RefusesApproved()
    {
        var (emitter, _) = NewEmitter();
        var service = new ApprovalService(emitter);

        await Assert.ThrowsAsync<AutoApprovalRejectedException>(() =>
            service.IssueAsync(Guid.NewGuid(), Phase1Fixtures.Tenant, Verdict.APPROVED, CleanCompliance(),
                scores: null, suspectedVetoes: [], occurredAt: Phase1Fixtures.Now));
    }

    /// <summary>A human cannot "approve" over a fired or unevaluable veto; that is an override, not an approval.</summary>
    [Fact]
    public async Task RecordHumanApproval_OverLiveVeto_IsRejected()
    {
        var (emitter, _) = NewEmitter();
        var service = new ApprovalService(emitter);
        var withFiredVeto = new ComplianceResult([VetoResult.Fire("V4", "no grant"), .. Phase1Fixtures.AllPass().Skip(1)]);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.RecordHumanApprovalAsync(Guid.NewGuid(), Phase1Fixtures.Tenant, withFiredVeto,
                bas: 90m, scores: ClearingScores(), suspectedVetoes: [], humanApprovedAt: Phase1Fixtures.Now, occurredAt: Phase1Fixtures.Now));
    }

    /// <summary>Extraction down ⇒ NEEDS_REVIEW; the emitter records it and never auto-approves.</summary>
    [Fact]
    public async Task Extraction_Down_NeedsReview_NeverApproves()
    {
        var (emitter, log) = NewEmitter();
        var sub = Phase1Fixtures.Submission("great serum");
        var compliance = ComplianceGate.Evaluate(
            features: null, sub, Phase1Fixtures.BriefWithRequirements(), Phase1Fixtures.Adult(),
            [Phase1Fixtures.OrganicGrantWithEvidence(sub.Id)], Phase1Fixtures.Ledger("clinically proven"), []);
        var verdict = VerdictEngine.Resolve(compliance);
        Assert.Equal(Verdict.NEEDS_REVIEW, verdict);

        await new ApprovalService(emitter).IssueAsync(sub.Id, Phase1Fixtures.Tenant, verdict, compliance,
            scores: null, suspectedVetoes: [], occurredAt: Phase1Fixtures.Now);

        var e = await Single(log);
        Assert.Equal("NEEDS_REVIEW", e.Payload["verdict"]);
        Assert.NotEqual("APPROVED", e.Payload["verdict"]);
    }

    /// <summary>If the event append fails, the verdict is not issued and the caller sees the failure.</summary>
    [Fact]
    public async Task Verdict_EventAppendFails_VerdictNotIssued()
    {
        var writer = new ThrowingEventWriter();
        var emitter = new ComplianceEventEmitter(writer);
        var record = new VerdictIssuedRecord(
            Guid.NewGuid(), Phase1Fixtures.Tenant, Verdict.REJECTED,
            VetoesFired: ["V4"], SuspectedVetoes: [], HumanApprovedAt: null, OccurredAt: Phase1Fixtures.Now);

        await Assert.ThrowsAsync<IOException>(() => emitter.EmitVerdictIssuedAsync(record));
        Assert.Equal(1, writer.Attempts);   // it tried, it failed, it did not swallow the failure
    }

    private static async Task<OutcomeEvent> Single(AppendOnlyEventLog log)
    {
        var events = new List<OutcomeEvent>();
        await foreach (var e in log.ReplayAsync(Phase1Fixtures.Tenant)) events.Add(e);
        return Assert.Single(events);
    }
}
