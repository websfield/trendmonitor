using System.Reflection;
using System.Text.Json;
using UgcIntelligence.C2.Api.GateB;
using UgcIntelligence.Domain;
using UgcIntelligence.Domain.Provenance;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// P5-T9 (Money &amp; exploration + Measurement). The <strong>consolidated architecture-level</strong> guard
/// over the money core. It complements — does not re-run — the control engineer's unit tests: where
/// <c>ExplorationRateTests</c>, <c>BudgetAllocatorTests</c>, <c>ArmPropagationTests</c>, <c>BaselineTests</c>,
/// and <c>AmplificationAllocatedContractTests</c> assert the point and property cases, this suite adds the
/// <em>structural</em> guarantees a refactor can silently break:
///
/// <list type="bullet">
/// <item>ε has <strong>no public route outside [0.10, 0.30]</strong> — proven by the rejecting path (a zero
/// or an out-of-band value throws) <em>and</em> by scanning the whole public surface of the value object for
/// a bypassing factory/setter.</item>
/// <item>Every arm tag <strong>propagates unchanged</strong> onto every downstream snapshot, for every
/// horizon and both series, across randomized arms.</item>
/// <item>The two arm budgets are <strong>exactly accounted, neither borrows</strong> — asserted as a decimal
/// identity (<c>arm_spend + arm_unallocated == arm_budget</c>) over ≥ 1000 randomized cases, which is
/// strictly stronger than "each arm ≤ its budget" and is the guard a mis-tagged dollar trips.</item>
/// <item>Organic and boosted <strong>cannot be summed</strong> — the type throws, and a specificity
/// self-check proves the throw is aimed at the cross-series case, not everything.</item>
/// <item>The baseline is <strong>median + MAD, provably not mean + stddev</strong> — a heavy-tailed series
/// whose median, mean, MAD, and stddev are all distinct pins the estimator to the robust statistic.</item>
/// </list>
///
/// <para>Falsifiability is demonstrated for three guards by temporary, reverted production probes (ε floor,
/// arm crossing, organic≠boosted); the structural ε scan and the organic≠boosted specificity check are the
/// self-checks that keep those guards from decaying into no-ops.</para>
/// </summary>
public sealed class BudgetExplorationTests
{
    private const decimal Increment = 1m;

    // =====================================================================================
    // 1. ε floor/ceiling — the rejecting path (falsifiable) + a structural no-bypass scan
    // =====================================================================================

    /// <summary>
    /// A1. The rejecting path, restated here as the falsifiable core: zero, sub-floor, super-ceiling all
    /// throw, via the factory AND via JSON. (The full route enumeration lives in <c>ExplorationRateTests</c>;
    /// this is the guard the ε-floor falsification probe flips red.)
    /// </summary>
    [Fact]
    public void Epsilon_RejectsZeroAndOutOfBand_ViaFactoryAndJson()
    {
        Assert.Throws<ExplorationRateOutOfBoundsException>(() => ExplorationRate.From(0m));
        Assert.Throws<ExplorationRateOutOfBoundsException>(() => ExplorationRate.From(0.09m));
        Assert.Throws<ExplorationRateOutOfBoundsException>(() => ExplorationRate.From(0.31m));

        Assert.Throws<ExplorationRateOutOfBoundsException>(() => JsonSerializer.Deserialize<ExplorationRate>("0"));
        Assert.Throws<ExplorationRateOutOfBoundsException>(() => JsonSerializer.Deserialize<ExplorationRate>("0.09"));
        Assert.Throws<ExplorationRateOutOfBoundsException>(() => JsonSerializer.Deserialize<ExplorationRate>("0.31"));

        Assert.Equal(0.18m, ExplorationRate.Default.Value);
    }

    /// <summary>A1. A boundary property: every value in [0.10, 0.30] is accepted; everything outside throws.</summary>
    [Fact]
    public void Epsilon_BoundaryProperty_AcceptsInsideRejectsOutside()
    {
        for (var cents = 0; cents <= 50; cents++)
        {
            var v = cents / 100m;                                   // 0.00 .. 0.50
            var inBand = v >= ExplorationRate.Floor && v <= ExplorationRate.Ceiling;
            if (inBand)
                Assert.Equal(v, ExplorationRate.From(v).Value);
            else
                Assert.Throws<ExplorationRateOutOfBoundsException>(() => ExplorationRate.From(v));
        }
    }

    /// <summary>
    /// A1, structural. There is <strong>no public way to obtain an ExplorationRate</strong> except the
    /// validating <c>From</c> and the fixed <c>Default</c>: no public constructor, no other static producer,
    /// no public writable field or settable property. A bypassing factory such as <c>Unsafe(decimal)</c> or a
    /// mutable field would show up here as a new producer and fail the test.
    /// </summary>
    [Fact]
    public void Epsilon_HasNoPublicRoute_OutsideTheValidatingApi()
    {
        var t = typeof(ExplorationRate);

        Assert.Empty(t.GetConstructors());   // the ctor is private; no public new(...)

        static bool Produces(MemberInfo m) => m switch
        {
            // Exclude special-name methods (property getters/setters, operators): they are counted through
            // their PropertyInfo, and an operator like == returns bool anyway.
            MethodInfo mi => mi.ReturnType == typeof(ExplorationRate) && !mi.IsSpecialName,
            PropertyInfo pi => pi.PropertyType == typeof(ExplorationRate),
            FieldInfo fi => fi.FieldType == typeof(ExplorationRate),
            _ => false,
        };

        var producers = t.GetMembers(BindingFlags.Public | BindingFlags.Static)
            .Where(Produces)
            .Select(m => m.Name)
            .OrderBy(n => n, StringComparer.Ordinal)
            .ToArray();
        Assert.Equal(["Default", "From"], producers);

        // No public writable field, no public settable property — the value is immutable once validated.
        Assert.Empty(t.GetFields(BindingFlags.Public | BindingFlags.Instance));
        Assert.DoesNotContain(t.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static),
            p => p.SetMethod is { IsPublic: true });
    }

    // =====================================================================================
    // 2. Arm propagation — the tag reaches every snapshot unchanged, and never crosses
    // =====================================================================================

    /// <summary>
    /// A3. The arm on an allocation propagates onto <strong>every</strong> downstream snapshot — every
    /// horizon, both series — and is never lost or flipped. This is the only unconfounded evidence C1 ever
    /// receives; a dropped or crossed arm converts the exploration budget into money spent for nothing.
    /// </summary>
    [Fact]
    public void ArmPropagatesToEverySnapshot_Unchanged()
    {
        var rng = new Random(11);
        var horizons = new[] { Horizon.T24h, Horizon.T48h, Horizon.T7d };

        for (var t = 0; t < 500; t++)
        {
            var arm = rng.Next(2) == 0 ? Arm.Exploit : Arm.Explore;
            var source = new ScriptedPerformanceSource(series => new PerformanceReading(
                0.05m, Denominator.Reach, series, Provenance.Measured, Phase5Fixtures.T0));
            var collector = new PerformanceCollector(source);
            var post = Phase5Fixtures.Post(t + 1);

            foreach (var horizon in horizons)
            {
                foreach (var series in new[] { Series.Organic, Series.Boosted })
                {
                    var snap = collector.Collect(post, horizon, series, arm);
                    Assert.Equal(arm, snap!.Arm);                 // the tag survives the hop, unchanged
                    Assert.Equal(series, snap.Rate.Series);        // ...and the series is not conflated
                }

                var (organic, boosted) = collector.CollectBothSeries(post, horizon, arm);
                Assert.Equal(arm, organic!.Arm);
                Assert.Equal(arm, boosted!.Arm);
            }
        }
    }

    /// <summary>A post that was never amplified carries a null arm — the collector never invents one.</summary>
    [Fact]
    public void UnamplifiedPost_HasNullArm_NeverInvented()
    {
        var source = new ScriptedPerformanceSource(series => new PerformanceReading(
            0.05m, Denominator.Reach, series, Provenance.Measured, Phase5Fixtures.T0));
        var snap = new PerformanceCollector(source).Collect(Phase5Fixtures.Post(1), Horizon.T24h, Series.Organic, arm: null);
        Assert.Null(snap!.Arm);
    }

    /// <summary>
    /// A15b, complement. No live post ever appears under both arms, and every allocation's tag matches the
    /// arm it was filtered into — checked across 500 randomized allocations. (The policy-based crossing check
    /// is <c>BudgetAllocatorTests.Allocator_ArmTag_NeverCrossesBudget</c>; this asserts the post-set disjointness.)
    /// </summary>
    [Fact]
    public void NoPost_WearsBothArms()
    {
        var rng = new Random(29);
        for (var t = 0; t < 500; t++)
        {
            var r = RandomAllocation(rng, t, out _, out _);

            var exploitPosts = r.Exploit.Select(a => a.LivePostId).ToHashSet();
            var explorePosts = r.Explore.Select(a => a.LivePostId).ToHashSet();

            Assert.Empty(exploitPosts.Intersect(explorePosts));
            Assert.All(r.Exploit, a => Assert.Equal(Arm.Exploit, a.Arm));
            Assert.All(r.Explore, a => Assert.Equal(Arm.Explore, a.Arm));
        }
    }

    // =====================================================================================
    // 3. Exact-sum property — neither arm borrows (the strong decimal identity)
    // =====================================================================================

    /// <summary>
    /// A2 / A15b. Over ≥ 1000 randomized cases, each arm is <strong>exactly</strong> accounted:
    /// <c>exploit_spend + unallocated_exploit == (1−ε)·total</c> and
    /// <c>explore_spend + unallocated_explore == ε·total</c>, as decimal equalities. This is stronger than
    /// "each arm ≤ its budget": a single dollar that crossed the arm line, or an arm that borrowed from the
    /// other, breaks one of these identities. It is the guard the arm-crossing falsification probe flips red.
    /// </summary>
    [Fact]
    public void PerArmSumsAreExact_NeitherArmBorrows()
    {
        var rng = new Random(101);
        for (var t = 0; t < 1200; t++)
        {
            var r = RandomAllocation(rng, t, out var total, out var eps);

            var exploitBudget = total * eps.ExploitShare;
            var exploreBudget = total - exploitBudget;

            var exploitSpend = r.Exploit.Sum(a => a.Spend);
            var exploreSpend = r.Explore.Sum(a => a.Spend);

            // Exact per-arm accounting — the borrow check.
            Assert.Equal(exploitBudget, exploitSpend + r.UnallocatedExploit);
            Assert.Equal(exploreBudget, exploreSpend + r.UnallocatedExplore);

            // Whole-budget accounting and non-negativity.
            Assert.Equal(total, r.TotalAllocated + r.UnallocatedExploit + r.UnallocatedExplore);
            Assert.Equal(r.TotalAllocated, exploitSpend + exploreSpend);
            Assert.All(r.Allocations, a => Assert.True(a.Spend >= 0m));
        }
    }

    /// <summary>
    /// The four explore/exploit edge cases, each asserting the money stays on its own side of the arm line.
    /// The empty-exploit tier reports <c>unallocated_exploit</c> and never funds explore.
    /// </summary>
    [Theory]
    [InlineData("all_insufficient")]   // no exploit tier, whole explore to the uniform sub-pool
    [InlineData("empty_exploit")]      // only insufficient_baseline ⇒ (1−ε) unspent, disclosed
    [InlineData("empty_explore")]      // one baseline candidate is the whole exploit tier ⇒ ε unspent
    [InlineData("both_empty")]         // no candidates ⇒ nothing allocated, everything disclosed
    public void EdgeCases_MoneyStaysOnItsOwnSideOfTheArmLine(string scenario)
    {
        var eps = ExplorationRate.Default;
        const decimal total = 1000m;
        var exploitBudget = total * eps.ExploitShare;
        var exploreBudget = total - exploitBudget;

        IReadOnlyList<AllocationCandidate> candidates = scenario switch
        {
            "all_insufficient" => [Phase5Fixtures.Candidate(1, 30m, insufficientBaseline: true),
                                   Phase5Fixtures.Candidate(2, 20m, insufficientBaseline: true)],
            "empty_exploit" => [Phase5Fixtures.Candidate(1, 40m, insufficientBaseline: true)],
            "empty_explore" => [Phase5Fixtures.Candidate(1, 90m)],
            _ => [],
        };

        var r = new BudgetAllocator().Allocate(candidates, total, eps, rngSeed: 5, Increment, exploitTopN: 3);

        // The borrow identity holds in every edge case.
        Assert.Equal(exploitBudget, r.Exploit.Sum(a => a.Spend) + r.UnallocatedExploit);
        Assert.Equal(exploreBudget, r.Explore.Sum(a => a.Spend) + r.UnallocatedExplore);

        switch (scenario)
        {
            case "all_insufficient":
                Assert.Equal(exploitBudget, r.UnallocatedExploit);                 // exploit tier empty → (1−ε) unspent
                Assert.Equal(exploreBudget, r.Explore.Sum(a => a.Spend));          // whole ε to the uniform sub-pool
                Assert.All(r.Explore, a => Assert.Equal(SamplingPolicy.UniformRandomNoBaseline, a.Policy));
                break;
            case "empty_exploit":
                Assert.Equal(exploitBudget, r.UnallocatedExploit);                 // disclosed, NOT moved to explore
                Assert.Empty(r.Exploit);
                Assert.True(r.Explore.Sum(a => a.Spend) <= exploreBudget);         // explore never receives exploit money
                break;
            case "empty_explore":
                Assert.Equal(exploreBudget, r.UnallocatedExplore);                 // ε unspent, never zeroed by an empty tier
                Assert.Empty(r.Explore);
                Assert.Equal(ExplorationRate.Default.Value, r.Epsilon.Value);      // ε intact
                break;
            default:   // both_empty
                Assert.Equal(0m, r.TotalAllocated);
                Assert.Equal(total, r.UnallocatedExploit + r.UnallocatedExplore);
                break;
        }
    }

    // =====================================================================================
    // 4. Organic ≠ boosted — the two series cannot be summed
    // =====================================================================================

    /// <summary>
    /// A5, structural + falsifiable. The engagement-rate type throws on <c>+</c> across series (and on any
    /// <c>+</c>, by design), <c>CompareTo</c> throws across series, and the baseline service rejects a boosted
    /// series. This is the guard the organic≠boosted falsification probe flips red.
    /// </summary>
    [Fact]
    public void OrganicAndBoosted_CannotBeSummedOrCompared()
    {
        var organic = new EngagementRate(0.05m, Denominator.Reach, Series.Organic, Provenance.Measured, Phase5Fixtures.T0);
        var boosted = new EngagementRate(0.09m, Denominator.Reach, Series.Boosted, Provenance.Measured, Phase5Fixtures.T0);

        Assert.Throws<InvalidOperationException>(() => organic + boosted);       // no summed number exists
        Assert.Throws<IncomparableSeriesException>(() => organic.CompareTo(boosted));

        // A baseline is computed on the organic series only; a boosted rate in the window is rejected.
        Assert.Throws<IncomparableSeriesException>(() =>
            new CreatorBaselineService().Compute([organic, boosted]));
    }

    /// <summary>
    /// Specificity self-check: the throw is aimed at the cross-series case, not at everything. Two organic
    /// rates on the same denominator compare cleanly — so the guard above is a real discriminator, not a
    /// type that simply always throws (which would pass the throw-assertions vacuously).
    /// </summary>
    [Fact]
    public void SameSeriesSameDenominator_ComparesCleanly()
    {
        var a = new EngagementRate(0.05m, Denominator.Reach, Series.Organic, Provenance.Measured, Phase5Fixtures.T0);
        var b = new EngagementRate(0.08m, Denominator.Reach, Series.Organic, Provenance.Measured, Phase5Fixtures.T0);

        Assert.True(a.CompareTo(b) < 0);   // no throw — the prohibition is specific to crossing a series/denominator
    }

    // =====================================================================================
    // 5. Median + MAD, provably not mean + stddev
    // =====================================================================================

    /// <summary>
    /// A6. A heavy-tailed series whose median (2), mean (13), MAD (1), and stddev (~30.8) are all distinct.
    /// The baseline must equal the <strong>median and MAD</strong>; a mean/stddev substitution would report
    /// 13 and ~30.8 and fail every assertion here. This is the test that fails if the robust statistic is
    /// swapped for the moment-based one.
    /// </summary>
    [Fact]
    public void Baseline_IsMedianAndMad_NotMeanAndStdDev()
    {
        var values = new[] { 1m, 1m, 1m, 2m, 2m, 3m, 3m, 4m, 100m };
        var trailing = values.Select(v => Phase5Fixtures.Organic(v)).ToList();

        var baseline = new CreatorBaselineService().Compute(trailing);

        var mean = values.Average();                                  // 13
        var variance = values.Select(v => (v - mean) * (v - mean)).Average();
        var stdDev = (decimal)Math.Sqrt((double)variance);            // ~30.8

        Assert.Equal(2m, baseline.MedianEr24h);                       // the median
        Assert.NotEqual(mean, baseline.MedianEr24h!.Value);           // provably not the mean
        Assert.Equal(1m, baseline.Mad);                               // the MAD
        Assert.NotEqual(Math.Round(stdDev, 0), Math.Round(baseline.Mad!.Value, 0));   // provably not the stddev
        Assert.False(baseline.InsufficientBaseline);
    }

    // =====================================================================================
    // 6. rng_seed / sampler_version — cited, plus the structural complement
    // =====================================================================================

    /// <summary>
    /// A14/A17 are asserted at the contract boundary by <c>AmplificationAllocatedContractTests</c>
    /// (<c>RngSeedAndSamplerVersion_AreRequired_InSchema</c>, <c>AmplificationAllocated_WithoutSeed_FailsValidation</c>).
    /// The complement here is that the allocator <strong>always produces</strong> both, so the required fields
    /// are never absent at the source: every allocation carries the rng seed, and the sampler version is
    /// non-empty, for an arbitrary allocation.
    /// </summary>
    [Fact]
    public void Allocator_AlwaysProduces_SeedAndSamplerVersion_ForEveryAllocation()
    {
        const long seed = 777L;
        var candidates = new[]
        {
            Phase5Fixtures.Candidate(1, 90m), Phase5Fixtures.Candidate(2, 50m),
            Phase5Fixtures.Candidate(3, 20m, insufficientBaseline: true),
        };

        var r = new BudgetAllocator().Allocate(candidates, 1000m, ExplorationRate.Default, seed, Increment, exploitTopN: 1);

        Assert.False(string.IsNullOrWhiteSpace(r.SamplerVersion));
        Assert.Equal(seed, r.RngSeed);
        Assert.NotEmpty(r.Allocations);
        Assert.All(r.Allocations, a => Assert.Equal(seed, a.RngSeed));   // the seed rides every allocation
    }

    // =====================================================================================
    // helpers
    // =====================================================================================

    /// <summary>A randomized, in-bounds allocation: arbitrary total, ε ∈ [0.10, 0.30], candidate mix, top-n.</summary>
    private static AllocationResult RandomAllocation(Random rng, int seed, out decimal total, out ExplorationRate eps)
    {
        total = Math.Round((decimal)(rng.NextDouble() * 9000 + 1), 2);
        eps = ExplorationRate.From(0.10m + Math.Round((decimal)rng.NextDouble() * 0.20m, 4));   // strictly [0.10, 0.30]
        var count = rng.Next(0, 9);
        var candidates = Enumerable.Range(1, count)
            .Select(i => Phase5Fixtures.Candidate(i, aws: rng.Next(1, 100), insufficientBaseline: rng.Next(3) == 0))
            .ToList();

        return new BudgetAllocator().Allocate(candidates, total, eps, rngSeed: seed, Increment, exploitTopN: rng.Next(0, 5));
    }
}
