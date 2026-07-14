using System.Reflection;
using UgcIntelligence.C2.Api.Events;
using UgcIntelligence.C2.Api.Scoring;
using UgcIntelligence.Contracts;
using UgcIntelligence.Events;
using UgcIntelligence.Events.Writer;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>A9. Every produced score is emitted as a <c>SubmissionScored</c> event that pins its
/// <c>VersionTriple</c> and <c>breaker_state_at_score</c>, so a historical score is reconstructible.</summary>
public sealed class SubmissionScoredTests
{
    private static async Task<OutcomeEvent> ScoreAndCapture(BreakerState? breaker, bool anomalous = false)
    {
        var log = new AppendOnlyEventLog();
        var emitter = new ComplianceEventEmitter(new OutcomeEventWriter(log));
        var judged = anomalous
            ? Phase3Fixtures.Judged(fill: 80m, overrides: new Dictionary<string, decimal> { [Composition.HookStrength] = 250m })
            : Phase3Fixtures.Judged(fill: 80m);
        var service = new ScoringService(Phase3Fixtures.JudgeReturning(judged), emitter);

        await service.ScoreAsync(
            Phase3Fixtures.CleanCompliance(), Phase1Fixtures.Submission(), Phase1Fixtures.BriefNoRequirements(),
            Phase3Fixtures.Features(), Phase3Fixtures.Prompt(), Phase3Fixtures.Triple, Phase3Fixtures.Cohort,
            Phase3Fixtures.CompatibleExtractors, breaker, Phase1Fixtures.Now);

        var events = new List<OutcomeEvent>();
        await foreach (var e in log.ReplayAsync(Phase1Fixtures.Tenant)) events.Add(e);
        return Assert.Single(events, e => e.EventType == OutcomeEventType.SubmissionScored);
    }

    [Fact]
    public async Task StoredScore_PinsVersionTripleAndBreakerState()
    {
        var e = await ScoreAndCapture(BreakerState.Armed);

        var triple = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(e.Payload["version_triple"]);
        Assert.Equal("3.2.1", triple["extractor_version"]);
        Assert.Equal("1.1.0", triple["rubric_version"]);
        Assert.Equal("beauty.tiktok.v7", triple["pattern_library_version"]);

        Assert.Equal("armed", e.Payload["breaker_state_at_score"]);
        Assert.Equal("Estimated", e.Payload["provenance"]);   // every VPS is Estimated
        Assert.NotNull(e.Payload["vps"]);
        Assert.NotNull(e.Payload["bas"]);
    }

    [Fact]
    public async Task StoredScore_DefaultsBreakerToCold_WhenBreakerUnread()
    {
        var e = await ScoreAndCapture(breaker: null);
        Assert.Equal("cold", e.Payload["breaker_state_at_score"]);   // fail closed
    }

    [Fact]
    public async Task AnomalousScore_IsStoredWithTheFlag()
    {
        var e = await ScoreAndCapture(BreakerState.Armed, anomalous: true);
        Assert.Equal(true, e.Payload["anomalous"]);
    }
}

/// <summary>
/// A6. The composite is computed in C#, not returned by the model: <see cref="JudgeResult"/> and
/// <see cref="CriterionScore"/> carry no <c>Vps</c>, <c>Bas</c>, or <c>verdict</c> member.
/// </summary>
public sealed class JudgeContractTests
{
    [Theory]
    [InlineData(typeof(JudgeResult))]
    [InlineData(typeof(CriterionScore))]
    public void Judge_CannotReturnVps(Type judgeType)
    {
        var members = judgeType.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToArray();

        foreach (var forbidden in new[] { "Vps", "Bas", "Verdict" })
            Assert.DoesNotContain(forbidden, members);
    }

    /// <summary>The judge returns per-criterion scores and suspected vetoes — the shape the composition reads.</summary>
    [Fact]
    public void JudgeResult_ExposesCriteriaAndSuspectedVetoes()
    {
        var names = typeof(JudgeResult).GetProperties().Select(p => p.Name).ToArray();
        Assert.Contains("Criteria", names);
        Assert.Contains("SuspectedVetoes", names);
    }
}
