using UgcIntelligence.Contracts;

namespace UgcIntelligence.C2.Api.GateB;

/// <summary>
/// The AWS term inputs for one gate-cleared candidate. Each term value is a 0–100 percentile/normalised
/// score. <see cref="CreatorStanding"/> is the C³ framework's <c>ace_creator_score</c> — <strong>not
/// Component 3</strong>; C2's only read path to C3 is Contract C, the breaker.
/// </summary>
public sealed record AwsInputs(
    Guid LivePostId,
    decimal OutperformancePercentile,
    decimal CohortPercentile,
    decimal VpsNormalised,
    decimal CreatorStanding,
    decimal AudienceOverlapFit,
    bool InsufficientBaseline,
    bool AudioDegraded,
    BreakerState BreakerState);

/// <summary>The AWS for one candidate, the (possibly redistributed) weights it used, and its confidence band.</summary>
public sealed record AwsResult(
    Guid LivePostId,
    decimal Aws,
    IReadOnlyDictionary<string, decimal> Weights,
    (decimal Low, decimal High) Band,
    bool InsufficientBaseline)
{
    public bool BreakerDegraded { get; init; }
    public bool AudioDegraded { get; init; }
}

/// <summary>A ranked recommendation. When the top band overlaps a lower one, the ordering is disclosed, not asserted.</summary>
public sealed record RankedAmplification(IReadOnlyList<AwsResult> Ranked, bool BandsOverlap, string? OverlapDisclosure);

/// <summary>
/// P5-T5, REQ-032, A8/A13. Computes AWS with weight redistribution and confidence bands.
///
/// <para><strong>Redistribution.</strong> A breaker that is <c>tripped</c>/<c>cold</c> moves the 0.15
/// <c>vps_normalised</c> weight onto the measured performance terms (a prediction that has not
/// demonstrated skill contributes nothing to a spending decision). An <c>insufficient_baseline</c>
/// candidate has an undefined outperformance term, so its 0.45 moves to cohort percentile — never imputed
/// from creator tier. The redistributed weights always sum to exactly 1.0.</para>
///
/// <para><strong>Bands.</strong> <c>insufficient_baseline</c>, a non-armed breaker, and audio-degraded VPS
/// each widen the band. Where the rank-1 band overlaps the rank-4 band, the recommendation says so rather
/// than presenting a false ordering.</para>
/// </summary>
public static class AmplificationRanker
{
    public const string Outperformance = "outperformance_percentile";
    public const string Cohort = "cohort_percentile";
    public const string Vps = "vps_normalised";
    public const string CreatorStanding = "creator_standing";
    public const string AudienceOverlapFit = "audience_overlap_fit";

    /// <summary>Base AWS term weights (rubric-v1.json <c>aws.terms</c>). Pinned; drift-guarded by <c>AwsTests</c>.</summary>
    public static readonly IReadOnlyDictionary<string, decimal> BaseWeights = new Dictionary<string, decimal>
    {
        [Outperformance] = 0.45m,
        [Cohort] = 0.20m,
        [Vps] = 0.15m,
        [CreatorStanding] = 0.10m,
        [AudienceOverlapFit] = 0.10m,
    };

    private const decimal BaseHalfBand = 4m;
    private const decimal NoBaselineWiden = 16m;
    private const decimal BreakerWiden = 10m;
    private const decimal AudioWiden = 5m;

    public static AwsResult ComputeAws(AwsInputs input)
    {
        ArgumentNullException.ThrowIfNull(input);

        var breakerDegraded = input.BreakerState is BreakerState.Tripped or BreakerState.Cold;
        var w = BaseWeights.ToDictionary(kv => kv.Key, kv => kv.Value);

        // insufficient_baseline: the outperformance term is undefined; its weight moves to cohort percentile.
        if (input.InsufficientBaseline)
        {
            w[Cohort] += w[Outperformance];
            w[Outperformance] = 0m;
        }

        // breaker tripped/cold: vps contributes nothing; its weight moves to the surviving measured terms.
        if (breakerDegraded)
        {
            var vps = w[Vps];
            w[Vps] = 0m;
            if (input.InsufficientBaseline)
            {
                w[Cohort] += vps;   // outperformance is gone, so cohort is the only measured term left
            }
            else
            {
                var pool = w[Outperformance] + w[Cohort];
                var toOutperf = pool == 0m ? 0m : vps * w[Outperformance] / pool;
                var toCohort = vps - toOutperf;   // remainder keeps the total exactly 1.0
                w[Outperformance] += toOutperf;
                w[Cohort] += toCohort;
            }
        }

        var aws = Clamp(
            w[Outperformance] * input.OutperformancePercentile
            + w[Cohort] * input.CohortPercentile
            + w[Vps] * input.VpsNormalised
            + w[CreatorStanding] * input.CreatorStanding
            + w[AudienceOverlapFit] * input.AudienceOverlapFit);

        var half = BaseHalfBand
            + (input.InsufficientBaseline ? NoBaselineWiden : 0m)
            + (breakerDegraded ? BreakerWiden : 0m)
            + (input.AudioDegraded ? AudioWiden : 0m);

        return new AwsResult(input.LivePostId, aws, w, (Clamp(aws - half), Clamp(aws + half)), input.InsufficientBaseline)
        {
            BreakerDegraded = breakerDegraded,
            AudioDegraded = input.AudioDegraded,
        };
    }

    /// <summary>Rank gate-cleared candidates by AWS (descending) and disclose a rank-1/rank-4 band overlap.</summary>
    public static RankedAmplification Rank(IEnumerable<AwsInputs> candidates)
    {
        var ranked = candidates.Select(ComputeAws)
            .OrderByDescending(r => r.Aws)
            .ThenBy(r => r.LivePostId)
            .ToList();

        var overlap = ranked.Count >= 4 && Overlaps(ranked[0].Band, ranked[3].Band);
        var disclosure = overlap
            ? "The confidence band on rank 1 overlaps the band on rank 4: this ordering is not statistically distinguishable and is presented as a set, not a strict order."
            : null;

        return new RankedAmplification(ranked, overlap, disclosure);
    }

    private static bool Overlaps((decimal Low, decimal High) a, (decimal Low, decimal High) b) =>
        a.Low <= b.High && b.Low <= a.High;

    private static decimal Clamp(decimal v) => Math.Clamp(v, 0m, 100m);
}
