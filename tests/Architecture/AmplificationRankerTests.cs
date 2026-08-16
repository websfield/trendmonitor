using System.Text.Json;
using UgcIntelligence.C2.Api.GateB;
using UgcIntelligence.Contracts;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>P5-T5. AWS composition: weight redistribution that always sums to 1.0, and band-overlap disclosure.</summary>
public sealed class AwsTests
{
    private static decimal WeightSum(AwsResult r) => r.Weights.Values.Sum();

    /// <summary>A8. Breaker tripped ⇒ vps_normalised weight is 0, and the redistributed weights sum to 1.0.</summary>
    [Fact]
    public void Redistribution()
    {
        var armed = AmplificationRanker.ComputeAws(Phase5Fixtures.Aws(1, breaker: BreakerState.Armed));
        Assert.Equal(0.15m, armed.Weights[AmplificationRanker.Vps]);
        Assert.Equal(1.0m, WeightSum(armed));

        var tripped = AmplificationRanker.ComputeAws(Phase5Fixtures.Aws(1, breaker: BreakerState.Tripped));
        Assert.Equal(0m, tripped.Weights[AmplificationRanker.Vps]);          // VPS contributes nothing
        Assert.Equal(1.0m, WeightSum(tripped));                              // still sums to 1.0
        // The 0.15 moved onto the two measured performance terms.
        Assert.True(tripped.Weights[AmplificationRanker.Outperformance] > 0.45m);
        Assert.True(tripped.Weights[AmplificationRanker.Cohort] > 0.20m);
    }

    /// <summary>A7. insufficient_baseline moves the 0.45 outperformance weight to cohort percentile; sums to 1.0.</summary>
    [Fact]
    public void InsufficientBaseline_RedistributesOutperformanceToCohort()
    {
        var r = AmplificationRanker.ComputeAws(Phase5Fixtures.Aws(1, insufficientBaseline: true, breaker: BreakerState.Armed));
        Assert.Equal(0m, r.Weights[AmplificationRanker.Outperformance]);
        Assert.Equal(0.65m, r.Weights[AmplificationRanker.Cohort]);          // 0.20 + 0.45
        Assert.Equal(1.0m, WeightSum(r));
    }

    /// <summary>Double failure: breaker tripped AND no baseline ⇒ cohort is the only surviving performance term.</summary>
    [Fact]
    public void Aws_BreakerTrippedAndNoBaseline_RedistributesBoth()
    {
        var r = AmplificationRanker.ComputeAws(Phase5Fixtures.Aws(1, insufficientBaseline: true, breaker: BreakerState.Tripped));

        Assert.Equal(0m, r.Weights[AmplificationRanker.Outperformance]);
        Assert.Equal(0m, r.Weights[AmplificationRanker.Vps]);
        Assert.Equal(0.80m, r.Weights[AmplificationRanker.Cohort]);          // 0.20 + 0.45 + 0.15
        Assert.Equal(0.10m, r.Weights[AmplificationRanker.CreatorStanding]); // retains its 0.10
        Assert.Equal(0.10m, r.Weights[AmplificationRanker.AudienceOverlapFit]);
        Assert.Equal(1.0m, WeightSum(r));
    }

    /// <summary>A hard-gate concept lives in HardGates; here we confirm a low term never zeroes the whole score — weights only move.</summary>
    [Fact]
    public void Weights_OnlyMove_TheyNeverVanish()
    {
        var r = AmplificationRanker.ComputeAws(Phase5Fixtures.Aws(1, breaker: BreakerState.Cold, insufficientBaseline: true));
        Assert.Equal(1.0m, WeightSum(r));
    }

    /// <summary>The AWS term weights match rubric-v1.json exactly — a drift guard, not a memorised copy.</summary>
    [Fact]
    public void AwsWeights_MatchRubricExactly()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !File.Exists(Path.Combine(d.FullName, "CLAUDE.md"))) d = d.Parent;
        var rubric = JsonDocument.Parse(File.ReadAllText(Path.Combine(d!.FullName, "docs", "initial.past", "schemas", "rubric-v1.json"))).RootElement;

        var fromSchema = rubric.GetProperty("aws").GetProperty("terms").EnumerateArray()
            .ToDictionary(t => t.GetProperty("key").GetString()!, t => t.GetProperty("weight").GetDecimal());

        Assert.Equal(fromSchema, AmplificationRanker.BaseWeights);
    }
}

/// <summary>A13. The ranker discloses an overlapping top ordering rather than asserting a false one.</summary>
public sealed class RankerTests
{
    [Fact]
    public void Ranker_OverlappingBands_Disclosed()
    {
        // Four candidates with near-identical AWS and wide (insufficient_baseline) bands ⇒ rank-1 overlaps rank-4.
        var inputs = Enumerable.Range(1, 4)
            .Select(i => Phase5Fixtures.Aws(i, outperf: 60m, cohort: 60m, vps: 60m, standing: 60m, overlap: 60m, insufficientBaseline: true))
            .ToList();

        var ranked = AmplificationRanker.Rank(inputs);

        Assert.True(ranked.BandsOverlap);
        Assert.NotNull(ranked.OverlapDisclosure);
    }

    [Fact]
    public void Ranker_WellSeparated_NotFlagged()
    {
        var inputs = new[]
        {
            Phase5Fixtures.Aws(1, outperf: 95m, cohort: 95m), Phase5Fixtures.Aws(2, outperf: 70m, cohort: 70m),
            Phase5Fixtures.Aws(3, outperf: 45m, cohort: 45m), Phase5Fixtures.Aws(4, outperf: 15m, cohort: 15m),
        };
        var ranked = AmplificationRanker.Rank(inputs);
        Assert.False(ranked.BandsOverlap);
    }
}
