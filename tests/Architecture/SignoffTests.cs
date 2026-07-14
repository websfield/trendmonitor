using UgcIntelligence.C2.Api.GateB;
using UgcIntelligence.Events;
using UgcIntelligence.Events.Writer;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>P5-T7, REQ-037. Sign-off by a named human, and the rights gate that runs a second time.</summary>
public sealed class SignoffTests
{
    private static readonly Guid LivePost = Phase5Fixtures.Post(1);
    private static readonly Guid Submission = Guid.NewGuid();
    private static readonly Guid AllocationId = Guid.NewGuid();

    private static (SignoffService svc, AppendOnlyEventLog log) New()
    {
        var log = new AppendOnlyEventLog();
        return (new SignoffService(new GateBEventEmitter(new OutcomeEventWriter(log))), log);
    }

    [Fact]
    public async Task SignOff_WhenGatesClear_EmitsEvent()
    {
        var (svc, log) = New();
        var result = await svc.SignOffAsync(AllocationId, Phase1Fixtures.Tenant, "reviewer-9", Phase5Fixtures.T0, [],
            Phase5Fixtures.Facts(LivePost), [Phase5Fixtures.PaidGrant(Submission)], Phase5Fixtures.MeasuredProvenance());

        Assert.True(result.SignedOff);
        Assert.Equal(1, log.Count);
    }

    /// <summary>Signoff_RightsExpiredSinceRanking_Excluded. The gate runs twice: a grant expired since ranking excludes.</summary>
    [Fact]
    public async Task Signoff_RightsExpiredSinceRanking_Excluded()
    {
        var (svc, log) = New();
        var result = await svc.SignOffAsync(AllocationId, Phase1Fixtures.Tenant, "reviewer-9", Phase5Fixtures.T0, [],
            Phase5Fixtures.Facts(LivePost), [Phase5Fixtures.PaidGrant(Submission, expired: true)], Phase5Fixtures.MeasuredProvenance());

        Assert.False(result.SignedOff);
        Assert.Equal(GateBBlock.BlockedRights, result.ReChecked.Block);
        Assert.Equal(0, log.Count);   // no sign-off event for an excluded candidate
    }

    [Fact]
    public async Task SignOff_RequiresNamedReviewer()
    {
        var (svc, _) = New();
        await Assert.ThrowsAsync<ArgumentException>(() => svc.SignOffAsync(AllocationId, Phase1Fixtures.Tenant, "", Phase5Fixtures.T0, [],
            Phase5Fixtures.Facts(LivePost), [Phase5Fixtures.PaidGrant(Submission)], Phase5Fixtures.MeasuredProvenance()));
    }
}

/// <summary>A10, A11, A12. The client artefact: sign-off required, numberless when confidence is low, counterfactual.</summary>
public sealed class ClientArtefactTests
{
    private static readonly SignoffRecord Signoff = new(Guid.NewGuid(), "reviewer-9", Phase5Fixtures.T0, []);

    private static AllocationResult EmptyAllocation() =>
        new([], 0m, 0m, 0m, BetaSampler.Version, 1L, UgcIntelligence.Domain.ExplorationRate.Default);

    private static RankedAmplification RankArmed(bool insufficient = false) =>
        AmplificationRanker.Rank(new[]
        {
            Phase5Fixtures.Aws(1, outperf: 90m, cohort: 90m, insufficientBaseline: insufficient),
            Phase5Fixtures.Aws(2, outperf: 40m, cohort: 40m),
        });

    /// <summary>A10 / Signoff_RequiredBeforeClientArtefact. No sign-off ⇒ the artefact is refused.</summary>
    [Fact]
    public void Signoff_RequiredBeforeClientArtefact()
    {
        Assert.Throws<InvalidOperationException>(() =>
            ClientArtefactBuilder.Build(RankArmed(), [], EmptyAllocation(), UgcIntelligence.Contracts.BreakerState.Armed, signoff: null));
    }

    /// <summary>A11. Breaker not armed ⇒ ranking without numeric scores, with a plain limitation statement.</summary>
    [Fact]
    public void NumberlessWhenNotArmed()
    {
        var artefact = ClientArtefactBuilder.Build(RankArmed(), [], EmptyAllocation(), UgcIntelligence.Contracts.BreakerState.Cold, Signoff);

        Assert.True(artefact.Numberless);
        Assert.NotNull(artefact.LimitationStatement);
        Assert.All(artefact.Items, i => Assert.Null(i.Aws));   // no numeric scores
    }

    /// <summary>A11. Even with an armed breaker, low confidence (insufficient_baseline) forces numberless.</summary>
    [Fact]
    public void NumberlessWhenLowConfidenceDespiteArmed()
    {
        var artefact = ClientArtefactBuilder.Build(RankArmed(insufficient: true), [], EmptyAllocation(), UgcIntelligence.Contracts.BreakerState.Armed, Signoff);

        Assert.True(artefact.Numberless);
        Assert.All(artefact.Items, i => Assert.Null(i.Aws));
    }

    /// <summary>Armed and high confidence ⇒ numeric scores shown, labelled Estimated.</summary>
    [Fact]
    public void NumbersShown_WhenArmedAndConfident()
    {
        var artefact = ClientArtefactBuilder.Build(RankArmed(), [], EmptyAllocation(), UgcIntelligence.Contracts.BreakerState.Armed, Signoff);
        Assert.False(artefact.Numberless);
        Assert.All(artefact.Items, i => Assert.NotNull(i.Aws));
        Assert.All(artefact.Items, i => Assert.Equal("Estimated", i.Provenance));
    }

    /// <summary>A12. The counterfactual names what "boost highest raw engagement" would pick and how it differs.</summary>
    [Fact]
    public void CounterfactualTests()
    {
        // Post 2 has the highest RAW engagement, but Post 1 has the highest AWS (outperformance-normalised).
        var raw = new[] { (Phase5Fixtures.Post(1), 0.05m), (Phase5Fixtures.Post(2), 0.20m) };
        var artefact = ClientArtefactBuilder.Build(RankArmed(), raw, EmptyAllocation(), UgcIntelligence.Contracts.BreakerState.Armed, Signoff);

        Assert.Equal(Phase5Fixtures.Post(2), artefact.Counterfactual.NaiveTopPick);
        Assert.Equal(Phase5Fixtures.Post(1), artefact.Counterfactual.RecommendationTopPick);
        Assert.True(artefact.Counterfactual.Differs);
        Assert.Contains(Phase5Fixtures.Post(2).ToString(), artefact.Counterfactual.Explanation);
    }
}
