using UgcIntelligence.C3.Calibration.Calibration;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;
using UgcIntelligence.Domain.Provenance;

namespace UgcIntelligence.C3.Calibration.Api;

/// <summary>
/// The client-facing calibration view for <c>GET /api/calibration/{vertical}/{platform}</c>: the breaker
/// state, its reason, n, ρ, and the suspected-leak warning. <see cref="Rho"/> is null for a cohort with
/// n &lt; 60 — a threshold on a rho that does not exist would be a guess with a decimal point.
/// </summary>
public sealed record CalibrationView(
    string Vertical,
    string Platform,
    string BreakerState,
    string Reason,
    int N,
    decimal? Rho,
    bool SuspectedLeak,
    DateTimeOffset AsOf);

/// <summary>
/// P4-T8. The read-only handler behind <c>GET /api/calibration/{vertical}/{platform}</c>. It returns the
/// breaker state, reason, n, ρ and suspected_leak for a cohort. A cohort with n &lt; 60 returns <c>cold</c>
/// with a reason and <strong>no ρ</strong>; a cohort whose data is <see cref="Origin.Fixture"/>
/// <strong>never reaches this surface</strong> — the handler returns null, which the HTTP layer maps to
/// 404. This mirrors the Phase 0 fixture-origin discipline: fixture-seeded calibration data is not
/// client-facing.
/// </summary>
public sealed class CalibrationApi(ICalibrationSource source, IBreakerReader monitor)
{
    /// <summary>
    /// The calibration view for a cohort, or null when the cohort is fixture-seeded (never client-facing).
    /// </summary>
    public async Task<CalibrationView?> GetAsync(CohortKey cohort, CancellationToken ct = default)
    {
        var stat = await source.GetAsync(cohort, ct);
        if (stat.Origin == Origin.Fixture)
            return null;   // A fixture-seeded cohort never reaches a client surface.

        var reading = await monitor.ReadAsync(cohort, ct);
        return new CalibrationView(
            cohort.Vertical,
            cohort.Platform,
            reading.StateToken,
            reading.Reason,
            reading.N,
            reading.Rho,
            reading.SuspectedLeak,
            reading.AsOf);
    }
}
