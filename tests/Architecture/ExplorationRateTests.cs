using System.Text.Json;
using UgcIntelligence.Domain;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// ADR-0003. ε ∈ [0.10, 0.30], default 0.18, and <strong>no route to zero</strong>.
/// The routes are enumerated because "a configuration option that can be set to zero will be set to zero."
/// </summary>
public sealed class ExplorationRateTests
{
    // Route 1: the factory.
    [Fact]
    public void Zero_IsRejected() =>
        Assert.Throws<ExplorationRateOutOfBoundsException>(() => ExplorationRate.From(0m));

    [Fact]
    public void Negative_IsRejected() =>
        Assert.Throws<ExplorationRateOutOfBoundsException>(() => ExplorationRate.From(-0.05m));

    [Fact]
    public void BelowFloor_IsRejected() =>
        Assert.Throws<ExplorationRateOutOfBoundsException>(() => ExplorationRate.From(0.05m));

    [Fact]
    public void AboveCeiling_IsRejected() =>
        Assert.Throws<ExplorationRateOutOfBoundsException>(() => ExplorationRate.From(0.31m));

    [Theory]
    [InlineData(0.10)]   // floor, inclusive
    [InlineData(0.18)]   // default
    [InlineData(0.30)]   // ceiling, inclusive
    public void WithinBounds_IsAccepted(double v) =>
        Assert.Equal((decimal)v, ExplorationRate.From((decimal)v).Value);

    [Fact]
    public void Default_Is018() => Assert.Equal(0.18m, ExplorationRate.Default.Value);

    [Fact]
    public void ExploitShare_IsOneMinusEpsilon() =>
        Assert.Equal(0.82m, ExplorationRate.From(0.18m).ExploitShare);

    // Route 2: JSON deserialization — a config file, an API payload, a seeded fixture.
    [Fact]
    public void Deserialization_OfZero_IsRejected() =>
        Assert.Throws<ExplorationRateOutOfBoundsException>(() =>
            JsonSerializer.Deserialize<ExplorationRate>("0"));

    [Fact]
    public void Deserialization_BelowFloor_IsRejected() =>
        Assert.Throws<ExplorationRateOutOfBoundsException>(() =>
            JsonSerializer.Deserialize<ExplorationRate>("0.05"));

    [Fact]
    public void Deserialization_WithinBounds_RoundTrips()
    {
        var rate = JsonSerializer.Deserialize<ExplorationRate>("0.22");
        Assert.Equal(0.22m, rate.Value);
        Assert.Equal("0.22", JsonSerializer.Serialize(rate));
    }

    /// <summary>
    /// Route 3: the one a validating constructor cannot close. <c>default(ExplorationRate)</c> is a
    /// struct whose backing field is zero. Reading it must throw rather than quietly yielding ε = 0.
    /// </summary>
    [Fact]
    public void DefaultStructValue_ThrowsRatherThanYieldingZero()
    {
        var uninitialised = default(ExplorationRate);
        Assert.Throws<InvalidOperationException>(() => uninitialised.Value);
    }

    [Fact]
    public void ThereIsNoPublicConstructor()
    {
        var ctors = typeof(ExplorationRate).GetConstructors();
        Assert.Empty(ctors);
    }
}
