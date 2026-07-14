namespace UgcIntelligence.Domain.Provenance;

/// <summary>REQ-030. Declared and period-stable. Rates on different denominators are not compared.</summary>
public enum Denominator { Reach, Impressions, Followers }

/// <summary>
/// REQ-030. Organic and boosted are separate series and are <em>never summed</em>.
/// A boosted post's engagement includes engagement the brand paid for; summing them and
/// calling it performance is how a system convinces itself that amplification works.
/// </summary>
public enum Series { Organic, Boosted }

/// <summary>Distinguishes a real outcome from a seeded fixture. A fixture never reaches a client surface.</summary>
public enum Origin { Real, Fixture }

/// <summary>
/// An engagement rate that knows its own denominator. Two rates computed against different
/// denominators are not comparable, and this type refuses to compare them rather than
/// silently producing a phantom outperformance signal.
/// </summary>
public readonly record struct EngagementRate(
    decimal Value,
    Denominator Denominator,
    Series Series,
    Provenance Provenance,
    DateTimeOffset AsOf,
    Origin Origin = Origin.Real)
{
    /// <summary>
    /// Throws when the denominators differ (a baseline whose denominator changed mid-window is
    /// invalidated, not carried) <em>or</em> when the series differ. An organic rate compared against
    /// a boosted rate is a paid number racing an unpaid one, and the winner is a phantom.
    /// </summary>
    public int CompareTo(EngagementRate other)
    {
        if (Denominator != other.Denominator)
            throw new IncomparableDenominatorException(Denominator, other.Denominator);
        if (Series != other.Series)
            throw new IncomparableSeriesException(Series, other.Series);
        return Value.CompareTo(other.Value);
    }

    /// <summary>
    /// Organic and boosted are never summed. This method exists so the prohibition has a
    /// name to fail against rather than being an absence someone fills in.
    /// </summary>
    public static EngagementRate operator +(EngagementRate a, EngagementRate b) =>
        throw new InvalidOperationException(
            "Organic and boosted engagement are separate series and are never summed (REQ-030).");
}

public sealed class IncomparableDenominatorException(Denominator left, Denominator right)
    : InvalidOperationException(
        $"Cannot compare an engagement rate denominated in {left} with one denominated in {right}. " +
        "Every rate names a period-stable denominator (REQ-030).");

public sealed class IncomparableSeriesException(Series left, Series right)
    : InvalidOperationException(
        $"Cannot compare an {left} engagement rate with a {right} one. Organic and boosted are separate " +
        "series: a boosted post's engagement includes engagement the brand paid for (REQ-030).");
