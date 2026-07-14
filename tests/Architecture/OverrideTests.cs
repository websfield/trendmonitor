using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Events;
using UgcIntelligence.C2.Api.Verdicts;
using UgcIntelligence.Events;
using UgcIntelligence.Events.Writer;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>A10, REQ-017. VerdictOverridden records original, override, reason, and reviewer id.</summary>
public sealed class OverrideTests
{
    private static (OverrideService svc, AppendOnlyEventLog log) NewService()
    {
        var log = new AppendOnlyEventLog();
        return (new OverrideService(new ComplianceEventEmitter(new OutcomeEventWriter(log))), log);
    }

    private static ComplianceResult CleanCompliance() => new(Phase1Fixtures.AllPass());

    [Fact]
    public async Task Override_RecordsOriginalOverrideReasonAndReviewer()
    {
        var (svc, log) = NewService();
        var submissionId = Guid.NewGuid();

        await svc.OverrideAsync(submissionId, Phase1Fixtures.Tenant,
            originalVerdict: Verdict.REJECTED, overrideVerdict: Verdict.APPROVED_WITH_NOTES,
            reason: "Disclosure confirmed present in the published cut on manual review.",
            reviewerId: "reviewer-42", compliance: CleanCompliance(), humanApprovedAt: null,
            occurredAt: Phase1Fixtures.Now);

        var e = await Single(log);
        Assert.Equal(OutcomeEventType.VerdictOverridden, e.EventType);
        Assert.Equal("REJECTED", e.Payload["original_verdict"]);
        Assert.Equal("APPROVED_WITH_NOTES", e.Payload["override_verdict"]);
        Assert.Equal("reviewer-42", e.Payload["reviewer_id"]);
        Assert.Contains("Disclosure confirmed", (string)e.Payload["reason"]!);
    }

    /// <summary>An override is a compensating event: the original VerdictIssued is not deleted.</summary>
    [Fact]
    public async Task Override_IsCompensating_OriginalRemains()
    {
        var log = new AppendOnlyEventLog();
        var emitter = new ComplianceEventEmitter(new OutcomeEventWriter(log));
        var svc = new OverrideService(emitter);
        var submissionId = Guid.NewGuid();

        await emitter.EmitVerdictIssuedAsync(new VerdictIssuedRecord(
            submissionId, Phase1Fixtures.Tenant, Verdict.REJECTED, ["V1"], [], null, Phase1Fixtures.Now));
        await svc.OverrideAsync(submissionId, Phase1Fixtures.Tenant, Verdict.REJECTED, Verdict.APPROVED_WITH_NOTES,
            "reviewed", "reviewer-42", CleanCompliance(), null, Phase1Fixtures.Now.AddMinutes(1));

        var events = new List<OutcomeEvent>();
        await foreach (var e in log.ReplayAsync(Phase1Fixtures.Tenant)) events.Add(e);

        Assert.Equal(2, events.Count);
        Assert.Contains(events, e => e.EventType == OutcomeEventType.VerdictIssued);
        Assert.Contains(events, e => e.EventType == OutcomeEventType.VerdictOverridden);
    }

    [Theory]
    [InlineData("", "reviewer-1")]
    [InlineData("a reason", "")]
    public async Task Override_RequiresReasonAndReviewer(string reason, string reviewer)
    {
        var (svc, _) = NewService();
        await Assert.ThrowsAsync<ArgumentException>(() =>
            svc.OverrideAsync(Guid.NewGuid(), Phase1Fixtures.Tenant, Verdict.REJECTED, Verdict.APPROVED_WITH_NOTES,
                reason, reviewer, CleanCompliance(), null, Phase1Fixtures.Now));
    }

    private static async Task<OutcomeEvent> Single(AppendOnlyEventLog log)
    {
        var events = new List<OutcomeEvent>();
        await foreach (var e in log.ReplayAsync(Phase1Fixtures.Tenant)) events.Add(e);
        return Assert.Single(events);
    }
}
