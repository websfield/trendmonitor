using UgcIntelligence.Domain.Provenance;

namespace UgcIntelligence.C2.Api.GateB;

/// <summary>The three snapshot horizons. Each is collected separately; a missing one is never imputed from another.</summary>
public enum Horizon
{
    T24h,
    T48h,
    T7d,
}

/// <summary>
/// A raw reading from a platform source: the value, its named denominator, its series, its provenance,
/// and the <strong>true</strong> collection time. A keyless read is <see cref="Provenance.Proxy"/>; a
/// client-authorised connection or a manual export is <see cref="Provenance.Measured"/> /
/// <see cref="Provenance.UserProvided"/>.
/// </summary>
public sealed record PerformanceReading(
    decimal Value,
    Denominator Denominator,
    Series Series,
    Provenance Provenance,
    DateTimeOffset AsOf);

/// <summary>
/// The platform analytics seam — a client-authorised connection, a manual export, or a paid provider.
/// Returns null when the source is unavailable: there is no snapshot to record, and nothing is imputed.
/// </summary>
public interface IPerformanceSource
{
    PerformanceReading? Read(Guid livePostId, Horizon horizon, Series series);
}

/// <summary>
/// One collected snapshot. Its <see cref="Rate"/> knows its denominator and series and refuses to be
/// summed with the other series. <see cref="Arm"/> is the amplification arm propagated from the
/// allocation (null if the post was never amplified), and it travels onward into the event stream.
/// </summary>
public sealed record PerformanceSnapshot(Guid LivePostId, Horizon Horizon, EngagementRate Rate, Arm? Arm);

/// <summary>
/// P5-T1, REQ-030. Snapshots each live post at T+24h/48h/7d. <strong>Organic and boosted are collected as
/// separate series and never summed</strong> — a boosted post's engagement includes engagement the brand
/// paid for, and summing them is how a system convinces itself amplification works. Every rate names a
/// period-stable denominator, records its provenance, and stamps its <em>true</em> <c>as_of</c>. When the
/// source is down there is no snapshot; a missing snapshot is never imputed.
/// </summary>
public sealed class PerformanceCollector(IPerformanceSource source)
{
    /// <summary>
    /// Collect one (horizon, series) snapshot, or null if the source has no reading. The organic and
    /// boosted series are collected by separate calls and returned as separate snapshots — never merged.
    /// </summary>
    public PerformanceSnapshot? Collect(Guid livePostId, Horizon horizon, Series series, Arm? arm = null)
    {
        var reading = source.Read(livePostId, horizon, series);
        if (reading is null)
            return null;   // source down: no snapshot, and no imputed value

        var rate = new EngagementRate(
            reading.Value, reading.Denominator, reading.Series, reading.Provenance, reading.AsOf);

        return new PerformanceSnapshot(livePostId, horizon, rate, arm);
    }

    /// <summary>
    /// Collect both series for a horizon, each as its own snapshot. The two are returned side by side and
    /// are never combined — the return is a pair, not a sum.
    /// </summary>
    public (PerformanceSnapshot? Organic, PerformanceSnapshot? Boosted) CollectBothSeries(
        Guid livePostId, Horizon horizon, Arm? arm = null) =>
        (Collect(livePostId, horizon, Series.Organic, arm),
         Collect(livePostId, horizon, Series.Boosted, arm));
}
