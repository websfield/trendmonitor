using UgcIntelligence.Domain.Provenance;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// ADR-0001, REQ-008. A <c>Proxy</c> value never enters an effect-size calculation, at any weight,
/// under any configuration. Provenance is a <em>type</em>, so this is a compile/construction barrier,
/// not a rule a reviewer has to notice.
/// </summary>
public sealed class ProvenanceTypeTests
{
    private static Provenanced<decimal> Value(Provenance p) => new(1.41m, p, DateTimeOffset.UnixEpoch);

    /// <summary>
    /// The whole invariant, in one assertion. Exemplar posts carry Proxy engagement, because no closed
    /// platform has a compliant keyless read surface. An estimator that pools exemplar and internal
    /// outcomes computes a lift over Proxy numbers and feeds the result into VPS retrieval, where a
    /// client eventually reads it as a calibrated score.
    /// </summary>
    [Fact]
    public void Proxy_CannotBecomeMeasuredOutcome() =>
        Assert.Null(MeasuredOutcome.TryFrom(Value(Provenance.Proxy)));

    [Fact]
    public void Estimated_CannotBecomeMeasuredOutcome() =>
        Assert.Null(MeasuredOutcome.TryFrom(Value(Provenance.Estimated)));

    [Theory]
    [InlineData(Provenance.Measured)]
    [InlineData(Provenance.UserProvided)]
    public void MeasurableProvenance_BecomesMeasuredOutcome(Provenance p) =>
        Assert.NotNull(MeasuredOutcome.TryFrom(Value(p)));

    /// <summary>
    /// The estimator's signature is the invariant. This compiles only because every input passed
    /// through <c>TryFrom</c>; a <c>Provenanced&lt;decimal&gt;</c> holding Proxy cannot be handed to it.
    /// </summary>
    [Fact]
    public void EffectSizeEstimator_AcceptsOnlyMeasuredOutcomes()
    {
        static decimal EstimateEffectSize(IEnumerable<MeasuredOutcome> outcomes) =>
            outcomes.Select(o => o.Value).DefaultIfEmpty(0m).Average();

        Provenanced<decimal>[] mixedCorpus =
        [
            Value(Provenance.Measured),      // internal corpus
            Value(Provenance.Proxy),         // exemplar corpus — must not contribute a number
            Value(Provenance.UserProvided),  // client export
            Value(Provenance.Estimated),     // a VPS. Never an input to an effect size.
        ];

        var admitted = mixedCorpus.Select(MeasuredOutcome.TryFrom).OfType<MeasuredOutcome>().ToArray();

        Assert.Equal(2, admitted.Length);
        Assert.All(admitted, o => Assert.True(o.Provenance is Provenance.Measured or Provenance.UserProvided));
        Assert.Equal(1.41m, EstimateEffectSize(admitted));
    }

    [Fact]
    public void EveryProvenancedValue_CarriesAnAsOfDate() =>
        Assert.Equal(DateTimeOffset.UnixEpoch, Value(Provenance.Measured).AsOf);
}

/// <summary>REQ-030. Denominator discipline, and the series that are never summed.</summary>
public sealed class MeasurementTypeTests
{
    private static EngagementRate Rate(decimal v, Denominator d, Series s = Series.Organic) =>
        new(v, d, s, Provenance.Measured, DateTimeOffset.UnixEpoch);

    [Fact]
    public void RatesOnDifferentDenominators_AreNotComparable() =>
        Assert.Throws<IncomparableDenominatorException>(() =>
            Rate(0.05m, Denominator.Reach).CompareTo(Rate(0.05m, Denominator.Impressions)));

    [Fact]
    public void RatesOnTheSameDenominator_Compare() =>
        Assert.True(Rate(0.06m, Denominator.Reach).CompareTo(Rate(0.05m, Denominator.Reach)) > 0);

    /// <summary>
    /// "A boosted post's engagement includes engagement the brand paid for. Summing them and calling
    /// it performance is how a system convinces itself that amplification works."
    /// </summary>
    [Fact]
    public void OrganicAndBoosted_AreNeverSummed() =>
        Assert.Throws<InvalidOperationException>(() =>
            Rate(0.05m, Denominator.Reach, Series.Organic) + Rate(0.02m, Denominator.Reach, Series.Boosted));
}

/// <summary>ADR-0001: the query layer refuses to aggregate across mixed provenance without a logged override.</summary>
public sealed class AggregationGuardTests
{
    private static Provenanced<decimal> V(Provenance p) => new(1m, p, DateTimeOffset.UnixEpoch);

    [Fact]
    public void MixedProvenance_RequiresLoggedOverride() =>
        Assert.Throws<MixedProvenanceException>(() =>
            AggregationGuard.EnsureHomogeneous([V(Provenance.Measured), V(Provenance.Proxy)]));

    [Fact]
    public void HomogeneousProvenance_Aggregates() =>
        Assert.Equal(2, AggregationGuard.EnsureHomogeneous([V(Provenance.Measured), V(Provenance.Measured)]).Count);

    [Fact]
    public void Override_MustBeLogged_AndCarryAReason()
    {
        var logged = new List<string>();
        var approved = new MixedProvenanceOverride(Guid.NewGuid(), "backfill audit 2026-07", logged.Add);

        AggregationGuard.EnsureHomogeneous([V(Provenance.Measured), V(Provenance.Proxy)], approved);

        Assert.Single(logged);
        Assert.Contains("MIXED_PROVENANCE_OVERRIDE", logged[0]);
    }

    [Fact]
    public void Override_WithoutAReason_Throws()
    {
        var approved = new MixedProvenanceOverride(Guid.NewGuid(), "   ", _ => { });
        Assert.Throws<InvalidOperationException>(() =>
            AggregationGuard.EnsureHomogeneous([V(Provenance.Measured), V(Provenance.Proxy)], approved));
    }
}
