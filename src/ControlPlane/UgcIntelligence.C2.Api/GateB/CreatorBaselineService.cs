using UgcIntelligence.Domain.Provenance;

namespace UgcIntelligence.C2.Api.GateB;

/// <summary>
/// A creator's trailing baseline: the <strong>median</strong> 24-hour engagement rate and its
/// <strong>median absolute deviation</strong>, on a single period-stable denominator.
/// <see cref="InsufficientBaseline"/> is true below eight trailing posts, in which case
/// <see cref="MedianEr24h"/> is not usable as an outperformance denominator and must never be imputed.
/// <see cref="DenominatorChanged"/> records that a denominator switch invalidated part of the window and
/// the baseline was recomputed on the consistent set — never silently carried.
/// </summary>
public sealed record CreatorBaseline(
    decimal? MedianEr24h,
    decimal? Mad,
    Denominator? Denominator,
    int TrailingPostsN,
    bool InsufficientBaseline,
    bool DenominatorChanged);

/// <summary>
/// P5-T3, REQ-031, A6/A7. Maintains the trailing baseline per (creator, platform).
///
/// <para><strong>Median and MAD, never mean and standard deviation.</strong> Engagement is heavy-tailed;
/// one prior viral post drags a mean baseline high enough to make every later post look like an
/// underperformer — precisely backwards.</para>
///
/// <para><strong>Minimum eight trailing posts.</strong> Below that, the outperformance ratio is undefined,
/// the candidate is flagged <c>insufficient_baseline</c>, its weight redistributes to cohort percentile,
/// and the band widens. <strong>It is never imputed from creator tier</strong> — imputing from tier
/// rebuilds the follower-count ranking the outperformance signal exists to escape.</para>
///
/// <para><strong>A denominator change mid-window invalidates the baseline.</strong> Rates on different
/// denominators are not comparable, so the baseline is recomputed on the current denominator's posts,
/// not carried forward across the change.</para>
/// </summary>
public sealed class CreatorBaselineService
{
    public const int MinTrailingPosts = 8;

    /// <summary>
    /// Compute the baseline over the trailing 24-hour engagement rates (most recent last). Only the
    /// organic series feeds a baseline; a boosted rate is a paid number and is rejected here.
    /// </summary>
    public CreatorBaseline Compute(IReadOnlyList<EngagementRate> trailing)
    {
        ArgumentNullException.ThrowIfNull(trailing);

        if (trailing.Count == 0)
            return new CreatorBaseline(null, null, null, 0, InsufficientBaseline: true, DenominatorChanged: false);

        if (trailing.Any(r => r.Series != Series.Organic))
            throw new IncomparableSeriesException(Series.Boosted, Series.Organic);

        // A denominator change mid-window invalidates the earlier posts: recompute on the current
        // denominator's consistent set rather than comparing across denominators.
        var currentDenominator = trailing[^1].Denominator;
        var consistent = trailing.Where(r => r.Denominator == currentDenominator).ToList();
        var denominatorChanged = consistent.Count != trailing.Count;

        var n = consistent.Count;
        if (n < MinTrailingPosts)
            return new CreatorBaseline(null, null, currentDenominator, n,
                InsufficientBaseline: true, denominatorChanged);

        var values = consistent.Select(r => r.Value).ToList();
        var median = Median(values);
        var mad = Median([.. values.Select(v => Math.Abs(v - median))]);

        return new CreatorBaseline(median, mad, currentDenominator, n,
            InsufficientBaseline: false, denominatorChanged);
    }

    /// <summary>
    /// The outperformance ratio <c>post_er_24h ÷ creator.median_er_24h</c>, or null when the baseline is
    /// insufficient or the denominators differ. <strong>Never imputed.</strong>
    /// </summary>
    public static decimal? OutperformanceRatio(EngagementRate postEr24h, CreatorBaseline baseline)
    {
        if (baseline.InsufficientBaseline || baseline.MedianEr24h is not { } median || median == 0m)
            return null;
        if (baseline.Denominator is not { } denom || postEr24h.Denominator != denom)
            return null;   // a ratio across differing denominators is a phantom
        return postEr24h.Value / median;
    }

    private static decimal Median(IReadOnlyList<decimal> values)
    {
        var sorted = values.OrderBy(v => v).ToList();
        var mid = sorted.Count / 2;
        return sorted.Count % 2 == 1
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2m;
    }
}
