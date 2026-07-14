using UgcIntelligence.C3.Calibration.Calibration;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;
using UgcIntelligence.Domain.Provenance;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>Deterministic fixtures for the Phase 4 calibration suite. No wall clock, no network.</summary>
internal static class Phase4Fixtures
{
    public static readonly DateTimeOffset T0 = DateTimeOffset.Parse("2026-07-11T00:00:00Z");

    public static CohortKey Cohort(string library = "beauty.tiktok.v7") =>
        new(Phase1Fixtures.Tenant, "beauty", "tiktok", "1.1.0", library);

    public static CalibrationStat Stat(int n, decimal? rho, bool suspectedLeak = false, Origin origin = Origin.Real) =>
        new(n, rho, suspectedLeak, T0, origin);

    /// <summary>A calibration source that answers every cohort with the same seeded statistic.</summary>
    public static ICalibrationSource SourceReturning(CalibrationStat stat) => new OfflineCalibrationSource(_ => stat);

    /// <summary>A calibration source driven by a mutable holder, so a test can change what C3 observes over time.</summary>
    public static ICalibrationSource SourceFrom(Func<CalibrationStat> current) => new OfflineCalibrationSource(_ => current());
}

/// <summary>A controllable <see cref="TimeProvider"/> for exercising the 60 s cache TTL.</summary>
internal sealed class TestClock(DateTimeOffset start) : TimeProvider
{
    private DateTimeOffset _now = start;
    public void Advance(TimeSpan by) => _now += by;
    public override DateTimeOffset GetUtcNow() => _now;
}

/// <summary>An <see cref="IBreakerReader"/> whose behaviour a test scripts (a reading, or a throw).</summary>
internal sealed class ScriptedBreakerReader(Func<BreakerReading> respond) : IBreakerReader
{
    public int Calls { get; private set; }

    public Task<BreakerReading> ReadAsync(CohortKey cohort, CancellationToken ct = default)
    {
        Calls++;
        return Task.FromResult(respond());   // respond may throw to simulate C3 being down
    }
}
