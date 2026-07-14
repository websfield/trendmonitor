using UgcIntelligence.C3.Calibration.Breaker;
using UgcIntelligence.Contracts;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// The C3 authority that turns the calibration statistic into a breaker state: automatic to trip, manual
/// to arm, and never guesses beyond what the source measured.
/// </summary>
public sealed class CalibrationMonitorTests
{
    private static readonly Guid Human = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");

    private static CalibrationMonitor Monitor(UgcIntelligence.C3.Calibration.Calibration.ICalibrationSource source, out BreakerStore store)
    {
        store = new BreakerStore();
        return new CalibrationMonitor(source, store, new TestClock(Phase4Fixtures.T0));
    }

    [Fact]
    public async Task InsufficientN_IsCold_WithNoRho()
    {
        var monitor = Monitor(Phase4Fixtures.SourceReturning(Phase4Fixtures.Stat(45, rho: null)), out _);

        var reading = await monitor.ReadAsync(Phase4Fixtures.Cohort());

        Assert.Equal(BreakerState.Cold, reading.State);
        Assert.Null(reading.Rho);                      // no rho below the held-out floor
        Assert.Equal(45, reading.N);
        Assert.Contains("insufficient_n", reading.Reason);
    }

    [Fact]
    public async Task RhoBelowThreshold_OnEnoughN_IsTripped()
    {
        var monitor = Monitor(Phase4Fixtures.SourceReturning(Phase4Fixtures.Stat(70, rho: 0.20m)), out _);
        var reading = await monitor.ReadAsync(Phase4Fixtures.Cohort());
        Assert.Equal(BreakerState.Tripped, reading.State);
    }

    /// <summary>
    /// P4 NaN fail-closed. A degenerate zero-variance cohort makes <c>spearmanr</c> return NaN, which the
    /// cross-plane tuple carries as an <em>absent</em> rho (<c>decimal?</c> has no NaN). At n ≥ 60 that
    /// uncomputable rho must fail closed to <c>cold</c> — <strong>never</strong> arm on garbage. This is
    /// distinct from the insufficient-n case (n &lt; 60): here n clears the floor but the statistic itself
    /// is uncomputable, and the monitor must still refuse to surface a VPS. "A high side is not a win," and
    /// an uncomputable side is not a win either.
    /// </summary>
    [Fact]
    public async Task CalibrationMonitor_UncomputableRhoAtN60_IsCold()
    {
        var monitor = Monitor(Phase4Fixtures.SourceReturning(Phase4Fixtures.Stat(80, rho: null)), out _);

        var reading = await monitor.ReadAsync(Phase4Fixtures.Cohort());

        Assert.Equal(BreakerState.Cold, reading.State);        // never Armed, never Tripped-then-treated-as-signal
        Assert.NotEqual(BreakerState.Armed, reading.State);
        Assert.Null(reading.Rho);                              // an uncomputable rho is surfaced as absent
        Assert.Equal(80, reading.N);                           // n cleared the floor; the statistic did not
        Assert.Contains("no_rho", reading.Reason);
    }

    /// <summary>
    /// The harder half: a cohort a human previously armed, whose rho then becomes uncomputable (NaN/absent)
    /// at n ≥ 60, must not stay armed. The arm is revoked and the reading is never <c>Armed</c> — a later
    /// human must arm again. An armed cohort silently riding a NaN would surface a VPS built on nothing.
    /// </summary>
    [Fact]
    public async Task CalibrationMonitor_ArmedCohort_RhoBecomesUncomputable_IsNotArmed()
    {
        decimal? rho = 0.42m;
        var monitor = Monitor(Phase4Fixtures.SourceFrom(() => Phase4Fixtures.Stat(80, rho)), out var store);
        var cohort = Phase4Fixtures.Cohort();
        await store.ArmAsync(cohort, Human, "calibration reviewed and accepted");
        Assert.Equal(BreakerState.Armed, (await monitor.ReadAsync(cohort)).State);

        rho = null;                                            // zero-variance cohort → spearmanr NaN → absent rho
        var degraded = await monitor.ReadAsync(cohort);

        Assert.NotEqual(BreakerState.Armed, degraded.State);   // never armed on an uncomputable rho
        Assert.False(store.Control(cohort).ManuallyArmed);     // the arm was revoked; a human must re-arm
    }

    [Fact]
    public async Task Eligible_ButNotManuallyArmed_IsCold_NotArmed()
    {
        // ρ ≥ 0.35 on n ≥ 60, but no human has armed it: VPS stays advisory until a person signs off.
        var monitor = Monitor(Phase4Fixtures.SourceReturning(Phase4Fixtures.Stat(80, rho: 0.42m)), out _);
        var reading = await monitor.ReadAsync(Phase4Fixtures.Cohort());
        Assert.Equal(BreakerState.Cold, reading.State);
        Assert.Contains("awaiting_manual_arm", reading.Reason);
    }

    [Fact]
    public async Task Eligible_AndManuallyArmed_IsArmed()
    {
        var monitor = Monitor(Phase4Fixtures.SourceReturning(Phase4Fixtures.Stat(80, rho: 0.42m)), out var store);
        await store.ArmAsync(Phase4Fixtures.Cohort(), Human, "calibration reviewed and accepted");

        var reading = await monitor.ReadAsync(Phase4Fixtures.Cohort());
        Assert.Equal(BreakerState.Armed, reading.State);
    }

    [Fact]
    public async Task AutoTrip_RevokesArm_RecoveryDoesNotReArm()
    {
        var rho = 0.42m;
        var monitor = Monitor(Phase4Fixtures.SourceFrom(() => Phase4Fixtures.Stat(80, rho)), out var store);
        var cohort = Phase4Fixtures.Cohort();
        await store.ArmAsync(cohort, Human, "reviewed");
        Assert.Equal(BreakerState.Armed, (await monitor.ReadAsync(cohort)).State);

        rho = 0.20m;                                         // calibration degrades
        Assert.Equal(BreakerState.Tripped, (await monitor.ReadAsync(cohort)).State);   // automatic trip

        rho = 0.42m;                                         // calibration recovers
        var recovered = await monitor.ReadAsync(cohort);
        Assert.Equal(BreakerState.Cold, recovered.State);    // NOT auto-re-armed; a human must arm again
        Assert.False(store.Control(cohort).ManuallyArmed);
    }

    [Fact]
    public async Task SuspectedLeak_IsSurfaced_ButDoesNotTrip()
    {
        var monitor = Monitor(Phase4Fixtures.SourceReturning(Phase4Fixtures.Stat(70, rho: 0.62m, suspectedLeak: true)), out var store);
        await store.ArmAsync(Phase4Fixtures.Cohort(), Human, "reviewed");

        var reading = await monitor.ReadAsync(Phase4Fixtures.Cohort());
        Assert.True(reading.SuspectedLeak);                 // a warning...
        Assert.Equal(BreakerState.Armed, reading.State);    // ...never a win, and it does not trip
    }

    [Fact]
    public async Task Shadow_IsReported_WhenChampionChallengerActive()
    {
        var monitor = Monitor(Phase4Fixtures.SourceReturning(Phase4Fixtures.Stat(80, rho: 0.42m)), out var store);
        store.SetShadow(Phase4Fixtures.Cohort(), active: true);

        var reading = await monitor.ReadAsync(Phase4Fixtures.Cohort());
        Assert.Equal(BreakerState.Shadow, reading.State);
    }

    /// <summary>Log lag stalls the held-out count; C3 reports the measured n and stays cold — it never guesses progress.</summary>
    [Fact]
    public async Task Calibration_LogLag_StopsAdvancing_DoesNotGuess()
    {
        var monitor = Monitor(Phase4Fixtures.SourceReturning(Phase4Fixtures.Stat(45, rho: null)), out _);
        var cohort = Phase4Fixtures.Cohort();

        for (var i = 0; i < 5; i++)
        {
            var reading = await monitor.ReadAsync(cohort);
            Assert.Equal(45, reading.N);                    // never extrapolated toward 60
            Assert.Equal(BreakerState.Cold, reading.State);
            Assert.Null(reading.Rho);
        }
    }
}
