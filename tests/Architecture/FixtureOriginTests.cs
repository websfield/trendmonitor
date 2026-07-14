using UgcIntelligence.Domain.Provenance;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// Phase 0 A13. At t=0 the system holds zero real outcomes, so every calibration cohort is
/// <c>cold</c> by construction and no VPS surfaces. But a seeded fixture will happily produce a
/// Spearman over twelve synthetic posts, and somebody will screenshot it.
///
/// <para><see cref="Origin"/> is a type, not a flag, for the same reason <see cref="Provenance"/>
/// is: so a fixture-sourced value cannot lose its marker on the way to a client surface.</para>
/// </summary>
public sealed class FixtureOriginTests
{
    /// <summary>Stands in for any client- or operator-facing surface. It refuses fixture data.</summary>
    private static void RenderToClient(MeasuredOutcome outcome)
    {
        if (outcome.Origin is Origin.Fixture)
            throw new InvalidOperationException(
                "A fixture-sourced outcome may never reach a client-facing surface. " +
                "Synthetic data produces a number; it does not produce evidence.");
    }

    [Fact]
    public void Origin_SurvivesTheTripThroughMeasuredOutcome()
    {
        var fixture = new Provenanced<decimal>(0.05m, Provenance.Measured, DateTimeOffset.UnixEpoch, Origin.Fixture);
        var outcome = MeasuredOutcome.TryFrom(fixture);

        Assert.NotNull(outcome);
        Assert.Equal(Origin.Fixture, outcome!.Value.Origin);   // the label does not fall off
    }

    [Fact]
    public void FixtureOutcome_NeverReachesAClientSurface()
    {
        var fixture = MeasuredOutcome.TryFrom(
            new Provenanced<decimal>(0.05m, Provenance.Measured, DateTimeOffset.UnixEpoch, Origin.Fixture))!.Value;

        Assert.Throws<InvalidOperationException>(() => RenderToClient(fixture));
    }

    [Fact]
    public void RealOutcome_Renders()
    {
        var real = MeasuredOutcome.TryFrom(
            new Provenanced<decimal>(0.05m, Provenance.Measured, DateTimeOffset.UnixEpoch))!.Value;

        RenderToClient(real);   // does not throw
        Assert.Equal(Origin.Real, real.Origin);
    }

    /// <summary>
    /// A record struct's implicit parameterless constructor would otherwise mint a "measured zero":
    /// value 0, provenance Measured (enum 0), origin Real. That is imputation by accident.
    /// </summary>
    [Fact]
    public void DefaultMeasuredOutcome_IsNotAFabricatedMeasuredZero()
    {
        var uninitialised = default(MeasuredOutcome);

        Assert.Throws<InvalidOperationException>(() => uninitialised.Value);
        Assert.Throws<InvalidOperationException>(() => uninitialised.Provenance);
        Assert.Throws<InvalidOperationException>(() => uninitialised.Origin);
    }
}

/// <summary>Organic and boosted are separate series — for summing, and for comparison.</summary>
public sealed class SeriesComparisonTests
{
    private static EngagementRate Rate(decimal v, Series s) =>
        new(v, Denominator.Reach, s, Provenance.Measured, DateTimeOffset.UnixEpoch);

    [Fact]
    public void OrganicAndBoosted_AreNotComparable() =>
        Assert.Throws<IncomparableSeriesException>(() =>
            Rate(0.05m, Series.Organic).CompareTo(Rate(0.09m, Series.Boosted)));

    [Fact]
    public void SameSeries_Compares() =>
        Assert.True(Rate(0.06m, Series.Organic).CompareTo(Rate(0.05m, Series.Organic)) > 0);
}
