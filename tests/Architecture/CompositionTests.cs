using System.Text.Json;
using UgcIntelligence.C2.Api.Scoring;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// P3-T4. VPS/BAS composition. The weights are pinned to <c>schemas/rubric-v1.json</c> and this suite
/// fails if the C# constants drift — so they are not "hardcoded from memory".
/// </summary>
public sealed class CompositionTests
{
    private static string RepoRoot()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !File.Exists(Path.Combine(d.FullName, "CLAUDE.md"))) d = d.Parent;
        return d?.FullName ?? throw new InvalidOperationException("repo root not found");
    }

    private static JsonElement Rubric() => JsonDocument
        .Parse(File.ReadAllText(Path.Combine(RepoRoot(), "docs", "initial", "schemas", "rubric-v1.json")))
        .RootElement;

    private static Dictionary<string, decimal> Full(decimal value) =>
        JudgeResultValidator.RequiredCriteria.ToDictionary(k => k, _ => value);

    /// <summary>A5. shareability weight is 0.00 and changing its score does not move the VPS.</summary>
    [Fact]
    public void Shareability_ZeroWeight()
    {
        Assert.Equal(0m, Composition.VpsWeights[Composition.Shareability]);

        var low = Full(80m);
        low[Composition.Shareability] = 0m;
        var high = Full(80m);
        high[Composition.Shareability] = 100m;

        Assert.Equal(Composition.ComposeVpsFromScores(low), Composition.ComposeVpsFromScores(high));
    }

    /// <summary>The VPS weights match rubric-v1.json exactly — the drift guard.</summary>
    [Fact]
    public void VpsWeights_MatchRubricExactly()
    {
        var fromSchema = Rubric().GetProperty("vps").GetProperty("criteria").EnumerateArray()
            .ToDictionary(c => c.GetProperty("key").GetString()!, c => c.GetProperty("weight").GetDecimal());
        Assert.Equal(fromSchema, Composition.VpsWeights);
    }

    /// <summary>The BAS weights match rubric-v1.json exactly.</summary>
    [Fact]
    public void BasWeights_MatchRubricExactly()
    {
        var fromSchema = Rubric().GetProperty("bas").GetProperty("components").EnumerateArray()
            .ToDictionary(c => c.GetProperty("key").GetString()!, c => c.GetProperty("weight").GetDecimal());
        Assert.Equal(fromSchema, Composition.BasWeights);
    }

    /// <summary>
    /// The audio-dependent set is sourced from rubric-v1.json (<c>vps.criteria[].audio_dependent</c>),
    /// not a hardcoded second copy — this drift guard fails if the C# set diverges from the contract.
    /// </summary>
    [Fact]
    public void AudioDependentSet_MatchesRubricExactly()
    {
        var fromSchema = Rubric().GetProperty("vps").GetProperty("criteria").EnumerateArray()
            .Where(c => c.GetProperty("audio_dependent").GetBoolean())
            .Select(c => c.GetProperty("key").GetString()!)
            .OrderBy(k => k, StringComparer.Ordinal);

        Assert.Equal(fromSchema, Composition.AudioDependentCriteria.OrderBy(k => k, StringComparer.Ordinal));
    }

    /// <summary>All criteria equal ⇒ VPS equals that value (weights sum to 1); floor rounding applies.</summary>
    [Fact]
    public void ComposeVps_IsWeightedMean_FloorRounded()
    {
        Assert.Equal(80m, Composition.ComposeVpsFromScores(Full(80m)));

        // A fractional weighted total floors down, never rounds up.
        var mixed = Full(70m);
        mixed[Composition.HookStrength] = 71m;   // adds 0.20 -> total 70.2
        Assert.Equal(70m, Composition.ComposeVpsFromScores(mixed));
    }

    /// <summary>Server-side clamp: an out-of-range score is clamped before it enters the composite.</summary>
    [Fact]
    public void ComposeVps_ClampsOutOfRangeScores()
    {
        var over = Full(100m);
        over[Composition.HookStrength] = 1000m;   // clamped to 100
        Assert.Equal(100m, Composition.ComposeVpsFromScores(over));

        var under = Full(0m);
        under[Composition.HookStrength] = -50m;    // clamped to 0
        Assert.Equal(0m, Composition.ComposeVpsFromScores(under));
    }

    /// <summary>BAS composes over its five components, floor-rounded.</summary>
    [Fact]
    public void ComposeBas_IsWeightedMean()
    {
        var components = new Dictionary<string, decimal>
        {
            [Composition.TalkingPointsCovered] = 100m,
            [Composition.MandatoryInclusions] = 100m,
            [Composition.ProhibitedContentAbsent] = 100m,
            [Composition.FormatSpecMet] = 100m,
            [Composition.ToneRegisterMatch] = 50m,     // 0.10 weight -> total 95
        };
        Assert.Equal(95m, Composition.ComposeBas(components));
    }
}
