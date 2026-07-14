using UgcIntelligence.C2.Api.GateB;
using UgcIntelligence.Domain.Provenance;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>A source that answers with a scripted reading, or null when "down".</summary>
internal sealed class ScriptedPerformanceSource(Func<Series, PerformanceReading?> respond) : IPerformanceSource
{
    public PerformanceReading? Read(Guid livePostId, Horizon horizon, Series series) => respond(series);
}

/// <summary>A5, A9. Measurement discipline at Gate B: organic and boosted never summed; proxy-only is unrankable.</summary>
public sealed class MeasurementTests
{
    /// <summary>A5. The organic and boosted series are collected separately and cannot be summed.</summary>
    [Fact]
    public void OrganicBoosted_NeverSummed()
    {
        var source = new ScriptedPerformanceSource(series => new PerformanceReading(
            series == Series.Organic ? 0.05m : 0.09m, Denominator.Reach, series, Provenance.Measured, Phase5Fixtures.T0));
        var collector = new PerformanceCollector(source);

        var (organic, boosted) = collector.CollectBothSeries(Phase5Fixtures.Post(1), Horizon.T24h, Arm.Exploit);

        Assert.Equal(Series.Organic, organic!.Rate.Series);
        Assert.Equal(Series.Boosted, boosted!.Rate.Series);
        // The type refuses to sum them: there is no combined number.
        Assert.Throws<InvalidOperationException>(() => organic.Rate + boosted.Rate);
    }

    /// <summary>A9 / Collector_ProxyOnly_Unrankable. Proxy-only performance ⇒ UNRANKABLE with a surfaced reason.</summary>
    [Fact]
    public void Collector_ProxyOnly_Unrankable()
    {
        var result = ProvenanceGate.Evaluate([Provenance.Proxy]);
        Assert.Equal(Rankability.Unrankable, result.Rankability);
        Assert.Contains("proxy-only", result.Reason!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ProvenanceGate_MeasuredOrUserProvided_IsRankable()
    {
        Assert.True(ProvenanceGate.Evaluate([Provenance.Measured]).IsRankable);
        Assert.True(ProvenanceGate.Evaluate([Provenance.UserProvided]).IsRankable);
        Assert.True(ProvenanceGate.Evaluate([Provenance.Proxy, Provenance.Measured]).IsRankable);
    }

    /// <summary>Collector_SourceDown_NoImputation. A down source yields no snapshot; nothing is imputed.</summary>
    [Fact]
    public void Collector_SourceDown_NoImputation()
    {
        var collector = new PerformanceCollector(new ScriptedPerformanceSource(_ => null));
        Assert.Null(collector.Collect(Phase5Fixtures.Post(1), Horizon.T24h, Series.Organic));
    }

    /// <summary>The snapshot records the reading's true as_of, not the intended horizon time.</summary>
    [Fact]
    public void Collector_RecordsTrueAsOf()
    {
        var trueAsOf = Phase5Fixtures.T0.AddHours(26);   // log lag: collected 2h late
        var source = new ScriptedPerformanceSource(series => new PerformanceReading(0.05m, Denominator.Reach, series, Provenance.Measured, trueAsOf));
        var snap = new PerformanceCollector(source).Collect(Phase5Fixtures.Post(1), Horizon.T24h, Series.Organic);
        Assert.Equal(trueAsOf, snap!.Rate.AsOf);
    }
}

/// <summary>A6, A7. Baseline uses median + MAD, requires 8 trailing posts, and never imputes.</summary>
public sealed class BaselineTests
{
    [Fact]
    public void MedianAndMad()
    {
        // One viral outlier must not drag the baseline: median is 10, a mean would be 133.75.
        var trailing = new[] { 10m, 10m, 10m, 10m, 10m, 10m, 10m, 1000m }
            .Select(v => Phase5Fixtures.Organic(v)).ToList();

        var baseline = new CreatorBaselineService().Compute(trailing);

        Assert.Equal(10m, baseline.MedianEr24h);          // median, not the mean (133.75)
        Assert.NotEqual(133.75m, baseline.MedianEr24h);
        Assert.Equal(0m, baseline.Mad);                   // MAD of seven 10s and one 1000
        Assert.False(baseline.InsufficientBaseline);
    }

    [Fact]
    public void NoTierImputation()
    {
        // Seven trailing posts ⇒ insufficient_baseline. The median is NOT imputed from anything.
        var trailing = Enumerable.Repeat(10m, 7).Select(v => Phase5Fixtures.Organic(v)).ToList();
        var baseline = new CreatorBaselineService().Compute(trailing);

        Assert.True(baseline.InsufficientBaseline);
        Assert.Null(baseline.MedianEr24h);                                       // never imputed
        Assert.Null(CreatorBaselineService.OutperformanceRatio(Phase5Fixtures.Organic(50m), baseline));
    }

    [Fact]
    public void Baseline_DenominatorChanged_Recomputed()
    {
        // Three old posts on Reach, then eight on Impressions: the denominator changed mid-window.
        var trailing = Enumerable.Repeat(0m, 3).Select(_ => Phase5Fixtures.Organic(99m, Denominator.Reach))
            .Concat(Enumerable.Repeat(0m, 8).Select(_ => Phase5Fixtures.Organic(20m, Denominator.Impressions)))
            .ToList();

        var baseline = new CreatorBaselineService().Compute(trailing);

        Assert.True(baseline.DenominatorChanged);                 // invalidated, not carried
        Assert.Equal(Denominator.Impressions, baseline.Denominator);
        Assert.Equal(8, baseline.TrailingPostsN);                 // recomputed on the consistent set only
        Assert.Equal(20m, baseline.MedianEr24h);
    }

    [Fact]
    public void OutperformanceRatio_IsPostOverMedian()
    {
        var trailing = Enumerable.Repeat(10m, 8).Select(v => Phase5Fixtures.Organic(v)).ToList();
        var baseline = new CreatorBaselineService().Compute(trailing);
        Assert.Equal(3m, CreatorBaselineService.OutperformanceRatio(Phase5Fixtures.Organic(30m), baseline));
    }
}
