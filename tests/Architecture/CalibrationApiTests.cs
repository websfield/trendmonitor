using UgcIntelligence.C3.Calibration.Api;
using UgcIntelligence.C3.Calibration.Breaker;
using UgcIntelligence.Domain.Provenance;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// P4-T8, A9c. GET /api/calibration/{vertical}/{platform} → state, reason, n, ρ, suspected_leak. A cohort
/// with n &lt; 60 returns cold with no ρ; a fixture-seeded cohort never reaches this surface.
/// </summary>
public sealed class CalibrationApiTests
{
    private static readonly Guid Human = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");

    private static CalibrationApi Api(UgcIntelligence.C3.Calibration.Calibration.ICalibrationSource source, out BreakerStore store)
    {
        store = new BreakerStore();
        var monitor = new CalibrationMonitor(source, store, new TestClock(Phase4Fixtures.T0));
        return new CalibrationApi(source, monitor);
    }

    [Fact]
    public async Task InsufficientN_ReturnsCold_WithReason_AndNoRho()
    {
        var api = Api(Phase4Fixtures.SourceReturning(Phase4Fixtures.Stat(45, rho: null)), out _);

        var view = await api.GetAsync(Phase4Fixtures.Cohort());

        Assert.NotNull(view);
        Assert.Equal("cold", view!.BreakerState);
        Assert.Null(view.Rho);
        Assert.Contains("insufficient_n", view.Reason);
        Assert.Equal(45, view.N);
    }

    /// <summary>A9c. A fixture-seeded cohort never reaches the client surface (handler returns null → 404).</summary>
    [Fact]
    public async Task FixtureCohort_NeverReachesTheSurface()
    {
        var api = Api(Phase4Fixtures.SourceReturning(Phase4Fixtures.Stat(80, rho: 0.42m, origin: Origin.Fixture)), out _);

        var view = await api.GetAsync(Phase4Fixtures.Cohort());

        Assert.Null(view);
    }

    [Fact]
    public async Task ArmedCohort_SurfacesStateAndSuspectedLeak()
    {
        var api = Api(Phase4Fixtures.SourceReturning(Phase4Fixtures.Stat(70, rho: 0.62m, suspectedLeak: true)), out var store);
        await store.ArmAsync(Phase4Fixtures.Cohort(), Human, "reviewed");

        var view = await api.GetAsync(Phase4Fixtures.Cohort());

        Assert.NotNull(view);
        Assert.Equal("armed", view!.BreakerState);
        Assert.True(view.SuspectedLeak);
        Assert.Equal(0.62m, view.Rho);
        Assert.Equal("beauty", view.Vertical);
        Assert.Equal("tiktok", view.Platform);
    }
}
