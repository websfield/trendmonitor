using UgcIntelligence.C2.Api.GateB;
using UgcIntelligence.Domain;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// P5-T6. The money core: exact sum, seeded reproducibility, arm tags that never cross the budget line,
/// the named uniform sub-pool share, and the explore edge cases.
/// </summary>
public sealed class BudgetAllocatorTests
{
    private static readonly ExplorationRate Eps = ExplorationRate.Default;   // 0.18, never zero
    private const decimal Increment = 1m;

    private static AllocationResult Allocate(IReadOnlyList<AllocationCandidate> candidates, decimal total,
        long seed = 12345, int exploitTopN = 3, ExplorationRate? eps = null) =>
        new BudgetAllocator().Allocate(candidates, total, eps ?? Eps, seed, Increment, exploitTopN);

    /// <summary>A2. total_allocated + unspent == total, and neither arm ever exceeds its budget — for many cases.</summary>
    [Fact]
    public void Allocator_SumsExactlyToBudget()
    {
        var rng = new Random(7);
        for (var t = 0; t < 1000; t++)
        {
            var total = Math.Round((decimal)(rng.NextDouble() * 9000 + 1), 2);
            var eps = ExplorationRate.From(0.10m + (decimal)rng.NextDouble() * 0.20m);
            var count = rng.Next(0, 9);
            var candidates = Enumerable.Range(1, count)
                .Select(i => Phase5Fixtures.Candidate(i, aws: (decimal)rng.Next(1, 100), insufficientBaseline: rng.Next(3) == 0))
                .ToList();

            var r = new BudgetAllocator().Allocate(candidates, total, eps, rngSeed: t, Increment, exploitTopN: rng.Next(0, 5));

            var exploitBudget = total * eps.ExploitShare;
            var exploreBudget = total - exploitBudget;

            Assert.Equal(total, r.TotalAllocated + r.UnallocatedExploit + r.UnallocatedExplore);   // fully accounted
            Assert.True(r.Exploit.Sum(a => a.Spend) <= exploitBudget);                              // never borrows
            Assert.True(r.Explore.Sum(a => a.Spend) <= exploreBudget);
        }
    }

    /// <summary>A3. Every allocation carries an arm.</summary>
    [Fact]
    public void EveryAllocation_CarriesAnArm()
    {
        var r = Allocate([Phase5Fixtures.Candidate(1, 90m), Phase5Fixtures.Candidate(2, 40m), Phase5Fixtures.Candidate(3, 20m, insufficientBaseline: true)], 1000m);
        Assert.All(r.Allocations, a => Assert.Contains(a.Arm, new[] { Arm.Exploit, Arm.Explore }));
    }

    /// <summary>A14. Same seed + same candidates ⇒ identical allocation.</summary>
    [Fact]
    public void Allocator_SeededDraw_IsReproducible()
    {
        var candidates = new[]
        {
            Phase5Fixtures.Candidate(1, 90m), Phase5Fixtures.Candidate(2, 60m),
            Phase5Fixtures.Candidate(3, 55m), Phase5Fixtures.Candidate(4, 30m, insufficientBaseline: true),
        };

        var a = Allocate(candidates, 4321m, seed: 999, exploitTopN: 2);
        var b = Allocate(candidates, 4321m, seed: 999, exploitTopN: 2);

        Assert.Equal(a.Allocations.Count, b.Allocations.Count);
        foreach (var (x, y) in a.Allocations.Zip(b.Allocations))
        {
            Assert.Equal(x.LivePostId, y.LivePostId);
            Assert.Equal(x.Arm, y.Arm);
            Assert.Equal(x.Spend, y.Spend);
        }
    }

    /// <summary>Verification step 2: 4321 across 7 candidates sums exactly to 4321 and every allocation has an arm.</summary>
    [Fact]
    public void Allocate_4321_Across7_SumsExactly()
    {
        var candidates = Enumerable.Range(1, 7).Select(i => Phase5Fixtures.Candidate(i, aws: 100m - i * 5m)).ToList();
        var r = Allocate(candidates, 4321m, exploitTopN: 4);
        Assert.Equal(4321m, r.TotalAllocated + r.UnallocatedExploit + r.UnallocatedExplore);
        Assert.All(r.Allocations, a => Assert.True(a.Arm is Arm.Exploit or Arm.Explore));
    }

    /// <summary>A16. The uniform sub-pool receives exactly UNIFORM_SUBPOOL_SHARE of the explore budget.</summary>
    [Fact]
    public void Allocator_UniformSubpoolShare()
    {
        // One exploit (baseline, top-n), one Thompson (baseline, not top-n), one uniform (insufficient_baseline).
        var candidates = new[]
        {
            Phase5Fixtures.Candidate(1, 90m),
            Phase5Fixtures.Candidate(2, 50m),
            Phase5Fixtures.Candidate(3, 20m, insufficientBaseline: true),
        };
        var total = 1000m;
        var r = Allocate(candidates, total, exploitTopN: 1);

        var exploreBudget = total - total * Eps.ExploitShare;
        var uniformSpend = r.Allocations.Where(a => a.Policy == SamplingPolicy.UniformRandomNoBaseline).Sum(a => a.Spend);
        Assert.Equal(BudgetAllocator.UniformSubpoolShare * exploreBudget, uniformSpend);
    }

    /// <summary>A15. All insufficient_baseline ⇒ the whole explore budget flows to the uniform sub-pool.</summary>
    [Fact]
    public void Allocator_AllInsufficientBaseline_WholeExploreToUniform()
    {
        var candidates = new[] { Phase5Fixtures.Candidate(1, 30m, insufficientBaseline: true), Phase5Fixtures.Candidate(2, 20m, insufficientBaseline: true) };
        var total = 1000m;
        var r = Allocate(candidates, total, exploitTopN: 3);

        var exploreBudget = total - total * Eps.ExploitShare;
        Assert.Equal(exploreBudget, r.Explore.Sum(a => a.Spend));                 // whole explore budget spent
        Assert.All(r.Explore, a => Assert.Equal(SamplingPolicy.UniformRandomNoBaseline, a.Policy));
        Assert.Equal(total * Eps.ExploitShare, r.UnallocatedExploit);            // exploit tier empty ⇒ (1−ε) unspent
    }

    /// <summary>A15. Empty exploit tier ⇒ (1−ε) unspent and disclosed, NEVER moved to explore.</summary>
    [Fact]
    public void Allocator_EmptyExploitTier_DoesNotFundExploreArm()
    {
        // Only insufficient_baseline candidates ⇒ no exploit tier.
        var candidates = new[] { Phase5Fixtures.Candidate(1, 40m, insufficientBaseline: true) };
        var total = 1000m;
        var r = Allocate(candidates, total, exploitTopN: 3);

        var exploitBudget = total * Eps.ExploitShare;
        Assert.Equal(exploitBudget, r.UnallocatedExploit);
        Assert.Empty(r.Exploit);
        Assert.True(r.Explore.Sum(a => a.Spend) <= total - exploitBudget);   // explore never receives exploit money
    }

    /// <summary>A15. Empty explore tier ⇒ ε unspent and disclosed; ε is never zeroed by an empty tier.</summary>
    [Fact]
    public void Allocator_EmptyExploreTier_LeavesEpsilonUnspent()
    {
        // A single baseline candidate that is the whole exploit tier ⇒ no Thompson pool, no uniform pool.
        var candidates = new[] { Phase5Fixtures.Candidate(1, 90m) };
        var total = 1000m;
        var r = Allocate(candidates, total, exploitTopN: 3);

        Assert.Equal(total - total * Eps.ExploitShare, r.UnallocatedExplore);
        Assert.Empty(r.Explore);
        Assert.Equal(ExplorationRate.Default.Value, r.Epsilon.Value);   // ε intact, never zeroed
    }

    /// <summary>Both tiers empty (no candidates) ⇒ total_allocated == 0, and it still sums exactly.</summary>
    [Fact]
    public void Allocator_AllExcluded_EmptyWithReasons()
    {
        var r = Allocate([], 1000m);
        Assert.Equal(0m, r.TotalAllocated);
        Assert.Equal(1000m, r.UnallocatedExploit + r.UnallocatedExplore);
    }

    /// <summary>A15b. Exploit money never carries an explore tag and vice versa, across edge cases.</summary>
    [Fact]
    public void Allocator_ArmTag_NeverCrossesBudget()
    {
        var rng = new Random(3);
        for (var t = 0; t < 500; t++)
        {
            var total = Math.Round((decimal)(rng.NextDouble() * 5000 + 1), 2);
            var eps = ExplorationRate.From(0.10m + (decimal)rng.NextDouble() * 0.20m);
            var candidates = Enumerable.Range(1, rng.Next(0, 7))
                .Select(i => Phase5Fixtures.Candidate(i, aws: (decimal)rng.Next(1, 100), insufficientBaseline: rng.Next(2) == 0))
                .ToList();

            var r = new BudgetAllocator().Allocate(candidates, total, eps, rngSeed: t, Increment, exploitTopN: rng.Next(0, 4));

            // Exploit allocations are exactly the ProportionalExploit ones; explore are the other two policies.
            Assert.All(r.Exploit, a => Assert.Equal(SamplingPolicy.ProportionalExploit, a.Policy));
            Assert.All(r.Explore, a => Assert.Contains(a.Policy, new[] { SamplingPolicy.Thompson, SamplingPolicy.UniformRandomNoBaseline }));
            Assert.True(r.Exploit.Sum(a => a.Spend) <= total * eps.ExploitShare);
            Assert.True(r.Explore.Sum(a => a.Spend) <= total - total * eps.ExploitShare);
        }
    }
}
