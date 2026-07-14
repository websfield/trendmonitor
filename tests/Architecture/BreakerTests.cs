using UgcIntelligence.C3.Calibration.Breaker;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// A2. C3's breaker authority: automatic to trip, manual to arm with a recorded reason. An arm with no
/// reason (or no human) is rejected, and a rejected write leaves the prior state exactly as it was.
/// </summary>
public sealed class BreakerTests
{
    private static readonly Guid Human = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");

    [Fact]
    public async Task AutoTrip_ManualArmWithReason()
    {
        var store = new BreakerStore();
        var cohort = Phase4Fixtures.Cohort();

        // Manual arm requires a human id AND a non-empty reason.
        await Assert.ThrowsAsync<ArgumentException>(() => store.ArmAsync(cohort, Human, ""));
        await Assert.ThrowsAsync<ArgumentException>(() => store.ArmAsync(cohort, Human, "   "));
        await Assert.ThrowsAsync<ArgumentException>(() => store.ArmAsync(cohort, Guid.Empty, "a reason"));

        // A valid arm records who and why.
        await store.ArmAsync(cohort, Human, "calibration reviewed against 62 held-out posts");
        var armed = store.Control(cohort);
        Assert.True(armed.ManuallyArmed);
        Assert.Equal(Human, armed.ArmedBy);
        Assert.Contains("held-out", armed.ArmReason!);

        // Auto-trip needs no human and revokes the arm.
        await store.TripAsync(cohort, "rho fell to 0.19");
        var tripped = store.Control(cohort);
        Assert.False(tripped.ManuallyArmed);
        Assert.Contains("0.19", tripped.LastTripReason!);
    }

    /// <summary>A rejected write (arm with no reason) never leaves a partial state — the prior arm is intact.</summary>
    [Fact]
    public async Task Breaker_WriteFails_StateUnchanged()
    {
        var store = new BreakerStore();
        var cohort = Phase4Fixtures.Cohort();
        await store.ArmAsync(cohort, Human, "original arm reason");

        await Assert.ThrowsAsync<ArgumentException>(() => store.ArmAsync(cohort, Human, ""));

        var control = store.Control(cohort);
        Assert.True(control.ManuallyArmed);                    // unchanged
        Assert.Equal("original arm reason", control.ArmReason); // not partially overwritten
    }

    [Fact]
    public async Task TripAsync_RequiresAReason()
    {
        var store = new BreakerStore();
        await Assert.ThrowsAsync<ArgumentException>(() => store.TripAsync(Phase4Fixtures.Cohort(), ""));
    }
}
