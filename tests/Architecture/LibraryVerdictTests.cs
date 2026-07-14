using UgcIntelligence.C3.Calibration.Breaker;
using UgcIntelligence.C3.Calibration.Verdicts;
using UgcIntelligence.Contracts;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// A6, Contract D. The paired champion/challenger verdict, and the window reset on promotion.
/// </summary>
public sealed class LibraryVerdictTests
{
    private static readonly Guid Human = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff");

    [Fact]
    public void Challenger_ClearlyBeatsIncumbent_Promotes() =>
        Assert.Equal(LibraryVerdict.Promote,
            ChampionChallengerEvaluator.Evaluate(new PairedCalibration(80, IncumbentRho: 0.40m, ChallengerRho: 0.46m)));

    [Fact]
    public void Challenger_ClearlyWorse_Rejects() =>
        Assert.Equal(LibraryVerdict.Reject,
            ChampionChallengerEvaluator.Evaluate(new PairedCalibration(80, IncumbentRho: 0.45m, ChallengerRho: 0.39m)));

    [Fact]
    public void Challenger_WithinMargin_ExtendsShadow() =>
        Assert.Equal(LibraryVerdict.ExtendShadow,
            ChampionChallengerEvaluator.Evaluate(new PairedCalibration(80, IncumbentRho: 0.45m, ChallengerRho: 0.46m)));

    [Fact]
    public void ThinSample_ExtendsShadow_NeverPromotesOnFewPosts() =>
        Assert.Equal(LibraryVerdict.ExtendShadow,
            ChampionChallengerEvaluator.Evaluate(new PairedCalibration(40, IncumbentRho: 0.30m, ChallengerRho: 0.90m)));

    [Fact]
    public void NullRho_ExtendsShadow() =>
        Assert.Equal(LibraryVerdict.ExtendShadow,
            ChampionChallengerEvaluator.Evaluate(new PairedCalibration(80, IncumbentRho: null, ChallengerRho: 0.50m)));

    /// <summary>A6. On promote, the window resets: the challenger's new cohort starts cold until n rebuilds.</summary>
    [Fact]
    public async Task Promotion_ResetsCalibrationWindow()
    {
        var store = new BreakerStore();
        var promotion = new LibraryPromotionService(store);
        var incumbent = Phase4Fixtures.Cohort("beauty.tiktok.v7");
        var challenger = Phase4Fixtures.Cohort("beauty.tiktok.v8");

        // The incumbent was armed; a shadow is running; the challenger even got (hypothetically) armed early.
        await store.ArmAsync(incumbent, Human, "incumbent calibrated");
        await store.ArmAsync(challenger, Human, "premature arm that a reset must clear");
        promotion.BeginShadow(incumbent);

        var outcome = promotion.Apply(
            new PairedCalibration(80, IncumbentRho: 0.40m, ChallengerRho: 0.48m), incumbent, challenger);

        Assert.Equal(LibraryVerdict.Promote, outcome.Verdict);
        Assert.Equal(challenger, outcome.ActiveCohort);

        // The window reset: the challenger cohort is no longer armed, and reads cold until n rebuilds.
        Assert.False(store.Control(challenger).ManuallyArmed);
        Assert.False(store.Control(incumbent).ShadowActive);

        var monitor = new CalibrationMonitor(
            Phase4Fixtures.SourceReturning(Phase4Fixtures.Stat(0, rho: null)), store, new TestClock(Phase4Fixtures.T0));
        var reading = await monitor.ReadAsync(challenger);
        Assert.Equal(BreakerState.Cold, reading.State);
        Assert.Equal(0, reading.N);
    }
}
