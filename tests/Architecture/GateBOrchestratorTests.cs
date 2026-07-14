using UgcIntelligence.C2.Api.GateB;
using UgcIntelligence.Domain;
using UgcIntelligence.Domain.Entities;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// The Gate B orchestration seam: <strong>hard gates exclude a candidate before it can be ranked or receive
/// an allocation.</strong> A blocked candidate never appears in <c>AllocationResult.Allocations</c> — for
/// either arm. Sign-off is a second backstop, not the primary control.
/// </summary>
public sealed class GateBOrchestratorTests
{
    /// <summary>
    /// A trailing baseline of eight organic posts at ER 10 (median 10, the outperformance denominator). The
    /// real ratio is computed from this baseline and the candidate's post ER — never a hardcoded placeholder.
    /// </summary>
    private static readonly CreatorBaseline Baseline =
        new CreatorBaselineService().Compute([.. Enumerable.Repeat(Phase5Fixtures.Organic(10m), 8)]);

    private static GateBCandidate Candidate(
        int n, decimal aws, bool insufficientBaseline = false, bool paidGrant = true,
        bool disclosure = true, decimal postEr = 25m, params string[] flags)
    {
        var grants = paidGrant
            ? new List<RightsGrant> { Phase5Fixtures.PaidGrant(Guid.NewGuid()) }
            : [];
        var facts = Phase5Fixtures.Facts(Phase5Fixtures.Post(n), disclosure, flags);
        // Compute the real outperformance ratio at the producer stage (post ER ÷ median baseline). An
        // insufficient_baseline candidate has no defined ratio, matching CreatorBaselineService's contract.
        var ratio = insufficientBaseline
            ? null
            : CreatorBaselineService.OutperformanceRatio(Phase5Fixtures.Organic(postEr), Baseline);
        return new GateBCandidate(
            Phase5Fixtures.Aws(n, outperf: aws, cohort: aws, insufficientBaseline: insufficientBaseline),
            PosteriorSuccesses: 6, PosteriorTrials: 10, facts, grants, Phase5Fixtures.MeasuredProvenance(), ratio);
    }

    /// <summary>A blocked candidate (rights, brand-safety, and a blocked explore-tier candidate) never receives money.</summary>
    [Fact]
    public void GateB_BlockedCandidate_NeverReceivesAllocation()
    {
        var clear = Candidate(1, aws: 90m);                                   // paid grant, disclosed, measured
        var blockedRights = Candidate(2, aws: 95m, paidGrant: false);         // highest AWS, but no paid grant
        var blockedBrandSafety = Candidate(3, aws: 80m, flags: "suspended");  // active brand-safety flag
        var blockedExplore = Candidate(4, aws: 20m, insufficientBaseline: true, paidGrant: false); // would be an explore/uniform arm

        var result = new GateBOrchestrator().Run(
            [clear, blockedRights, blockedBrandSafety, blockedExplore],
            total: 1000m, ExplorationRate.Default, rngSeed: 7, spendIncrement: 1m, exploitTopN: 3, awsFloor: 0m, Phase5Fixtures.T0);

        var allocatedIds = result.Allocation.Allocations.Select(a => a.LivePostId).ToHashSet();

        // No blocked candidate — in either arm — received an allocation.
        Assert.DoesNotContain(Phase5Fixtures.Post(2), allocatedIds);   // blocked_rights (would have been top exploit)
        Assert.DoesNotContain(Phase5Fixtures.Post(3), allocatedIds);   // blocked_brand_safety
        Assert.DoesNotContain(Phase5Fixtures.Post(4), allocatedIds);   // blocked_rights in the explore tier

        // Each is surfaced on the excluded list with its reason.
        Assert.Contains(result.Excluded, e => e.LivePostId == Phase5Fixtures.Post(2) && e.Block == GateBBlock.BlockedRights);
        Assert.Contains(result.Excluded, e => e.LivePostId == Phase5Fixtures.Post(3) && e.Block == GateBBlock.BlockedBrandSafety);
        Assert.Contains(result.Excluded, e => e.LivePostId == Phase5Fixtures.Post(4) && e.Block == GateBBlock.BlockedRights);

        // Falsifiable: the cleared candidate DOES receive money — the test is not vacuously passing on an empty allocation.
        Assert.Contains(Phase5Fixtures.Post(1), allocatedIds);
    }

    /// <summary>The excluded set carries the named missing grant, so the manager can go and obtain it.</summary>
    [Fact]
    public void ExcludedRights_NamesTheMissingGrant()
    {
        var result = new GateBOrchestrator().Run(
            [Candidate(1, 90m), Candidate(2, 80m, paidGrant: false)],
            1000m, ExplorationRate.Default, rngSeed: 1, 1m, exploitTopN: 3, 0m, Phase5Fixtures.T0);

        var excluded = Assert.Single(result.Excluded);
        Assert.Contains("paid_amplification", excluded.Reason);
    }

    /// <summary>
    /// A-R3-1 (#10): the orchestrator emits the <strong>real, computed</strong> outperformance ratio threaded
    /// through <c>GateBCandidate</c> — post ER 30 ÷ median baseline 10 = 3.0 — not the old hardcoded <c>1m</c>.
    /// An <c>insufficient_baseline</c> candidate still yields <c>null</c>.
    /// </summary>
    [Fact]
    public void GateB_EmitsRealOutperformanceRatio_NotHardcodedOne()
    {
        var baseline = new CreatorBaselineService().Compute([.. Enumerable.Repeat(Phase5Fixtures.Organic(10m), 8)]);
        var expected = CreatorBaselineService.OutperformanceRatio(Phase5Fixtures.Organic(30m), baseline);
        Assert.Equal(3m, expected);   // guards the fixture: a real outperformer, ratio ≠ 1

        var outperformer = Candidate(1, aws: 90m, postEr: 30m);            // real 3.0× outperformer, gate-cleared
        var noBaseline = Candidate(2, aws: 20m, insufficientBaseline: true);

        var result = new GateBOrchestrator().Run(
            [outperformer, noBaseline],
            total: 1000m, ExplorationRate.Default, rngSeed: 3, spendIncrement: 1m, exploitTopN: 3, awsFloor: 0m, Phase5Fixtures.T0);

        var emittedOutperformer = result.AllocationCandidates.Single(c => c.LivePostId == Phase5Fixtures.Post(1));
        Assert.Equal(3m, emittedOutperformer.OutperformanceRatio);         // the real value, threaded end-to-end
        Assert.NotEqual(1m, emittedOutperformer.OutperformanceRatio);      // falsifies the old hardcoded 1m

        var emittedNoBaseline = result.AllocationCandidates.Single(c => c.LivePostId == Phase5Fixtures.Post(2));
        Assert.Null(emittedNoBaseline.OutperformanceRatio);               // insufficient_baseline ⇒ null, unchanged
    }

    /// <summary>A fully-blocked field ⇒ empty allocation with every reason surfaced. Not an error, not a relaxed gate.</summary>
    [Fact]
    public void GateB_AllGatedOut_EmptyWithReasons()
    {
        var result = new GateBOrchestrator().Run(
            [Candidate(1, 90m, paidGrant: false), Candidate(2, 80m, disclosure: false)],
            1000m, ExplorationRate.Default, rngSeed: 1, 1m, exploitTopN: 3, 0m, Phase5Fixtures.T0);

        Assert.Empty(result.Allocation.Allocations);
        Assert.Equal(2, result.Excluded.Count);
        Assert.Equal(1000m, result.Allocation.UnallocatedExploit + result.Allocation.UnallocatedExplore);
    }
}
