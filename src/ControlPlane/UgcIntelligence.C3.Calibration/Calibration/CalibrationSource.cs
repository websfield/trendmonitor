using UgcIntelligence.Domain;
using UgcIntelligence.Domain.Provenance;

namespace UgcIntelligence.C3.Calibration.Calibration;

/// <summary>
/// The per-cohort calibration statistic — the cross-plane contract tuple <c>(n, rho, suspected_leak)</c>.
/// The Python plane computes it (temporal holdout, rolling Spearman, dataset exclusions); C3 (this C#
/// plane) owns the <em>decision</em> that turns it into a <see cref="Contracts.BreakerState"/>.
///
/// <list type="bullet">
/// <item><see cref="N"/> — held-out (scored, measured) submissions in the cohort, AFTER excluding
/// <c>anomalous</c> scores, <c>EXCLUDED_FROM_AI_SCORING</c> (V6) submissions, and <c>Origin.Fixture</c>
/// outcomes. The exclusions are the Python plane's job; C3 receives the already-filtered count.</item>
/// <item><see cref="Rho"/> — rolling Spearman on the held-out set. <strong>Null whenever <see cref="N"/> &lt; 60</strong>;
/// there is no rho for a cohort that has not accumulated enough evidence.</item>
/// <item><see cref="SuspectedLeak"/> — true when rho &gt; 0.5 out-of-sample on n ≥ 60. A warning, never a win;
/// it does not trip the breaker.</item>
/// </list>
///
/// <para><see cref="Origin"/> is a C#-side guard, not part of the numeric cross-plane tuple: a cohort
/// seeded entirely from fixtures is marked <see cref="Origin.Fixture"/> and never reaches a client surface.</para>
/// </summary>
public sealed record CalibrationStat(
    int N,
    decimal? Rho,
    bool SuspectedLeak,
    DateTimeOffset AsOf,
    Origin Origin = Origin.Real)
{
    /// <summary>The trip/arm threshold. Below this on n ≥ 60, the breaker trips automatically.</summary>
    public const decimal ArmThreshold = 0.35m;

    /// <summary>The out-of-sample suspicion threshold. rho above this on n ≥ 60 is a suspected leak, never a win.</summary>
    public const decimal SuspectedLeakThreshold = 0.5m;

    /// <summary>The minimum held-out count before a rho is meaningful, or a cohort can be armed.</summary>
    public const int MinHeldOut = 60;

    /// <summary>Guard against a source that hands back a rho for a small sample — there is no such rho.</summary>
    public bool IsWellFormed => N >= MinHeldOut ? true : Rho is null;
}

/// <summary>
/// The C3↔Python seam. C3 consumes this to obtain the statistic; it never computes ρ itself. Mirrors the
/// <c>IJudge</c> posture from Phase 3: a C#-abstracted boundary with a deterministic offline fake as the
/// default, and real Python integration a documented seam wired in a later phase (no cross-language RPC in
/// this repo yet).
/// </summary>
public interface ICalibrationSource
{
    Task<CalibrationStat> GetAsync(CohortKey cohort, CancellationToken ct = default);
}

/// <summary>
/// The deterministic offline default. Returns a cold, cold-start statistic (n = 0, rho = null) for any
/// unknown cohort, and whatever was seeded for a known one. No network, no Python, no clock surprise.
/// </summary>
public sealed class OfflineCalibrationSource(Func<CohortKey, CalibrationStat>? respond = null) : ICalibrationSource
{
    private readonly Func<CohortKey, CalibrationStat> _respond =
        respond ?? (_ => new CalibrationStat(N: 0, Rho: null, SuspectedLeak: false, DateTimeOffset.UnixEpoch));

    public Task<CalibrationStat> GetAsync(CohortKey cohort, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        return Task.FromResult(_respond(cohort));
    }
}
