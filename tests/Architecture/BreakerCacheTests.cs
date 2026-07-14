using UgcIntelligence.C2.Api.Breaker;
using UgcIntelligence.Contracts;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// P4-T5, A4. C2's read-through breaker cache fails closed to <c>cold</c>: an unreachable C3, or a cached
/// reading older than the 60 s TTL, is never served as last-known-armed. An unreachable referee is not permission.
/// </summary>
public sealed class BreakerCacheTests
{
    private static BreakerReading Armed() =>
        new(BreakerState.Armed, "armed_by=x", N: 80, Rho: 0.42m, SuspectedLeak: false, Phase4Fixtures.T0);

    private static BreakerReading Tripped() =>
        new(BreakerState.Tripped, "rho_below_threshold", N: 80, Rho: 0.20m, SuspectedLeak: false, Phase4Fixtures.T0);

    [Fact]
    public async Task Breaker_Unreachable_TreatedAsCold()
    {
        var inner = new ScriptedBreakerReader(() => throw new InvalidOperationException("C3 down"));
        var cache = new BreakerCache(inner, new TestClock(Phase4Fixtures.T0));

        var reading = await cache.ReadAsync(Phase4Fixtures.Cohort());

        Assert.Equal(BreakerState.Cold, reading.State);
        Assert.Contains("fail_closed", reading.Reason);
        Assert.Null(reading.Rho);
    }

    [Fact]
    public async Task Breaker_C3Down_CacheStale_IsCold()
    {
        var down = false;
        var inner = new ScriptedBreakerReader(() => down ? throw new InvalidOperationException("C3 down") : Armed());
        var clock = new TestClock(Phase4Fixtures.T0);
        var cache = new BreakerCache(inner, clock);
        var cohort = Phase4Fixtures.Cohort();

        // Prime the cache while C3 is up: armed.
        Assert.Equal(BreakerState.Armed, (await cache.ReadAsync(cohort)).State);

        // C3 goes down and the cached reading ages past the TTL.
        down = true;
        clock.Advance(TimeSpan.FromSeconds(61));

        var reading = await cache.ReadAsync(cohort);
        Assert.Equal(BreakerState.Cold, reading.State);   // NOT the stale last-known-armed
    }

    [Fact]
    public async Task FreshReading_WithinTtl_IsServedFromCache_WithoutHittingSource()
    {
        var calls = 0;
        var inner = new ScriptedBreakerReader(() => { calls++; return calls == 1 ? Armed() : throw new InvalidOperationException("should not be called"); });
        var cache = new BreakerCache(inner, new TestClock(Phase4Fixtures.T0));
        var cohort = Phase4Fixtures.Cohort();

        Assert.Equal(BreakerState.Armed, (await cache.ReadAsync(cohort)).State);
        Assert.Equal(BreakerState.Armed, (await cache.ReadAsync(cohort)).State);   // served from cache
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task StaleReading_PastTtl_IsRefreshedFromSource()
    {
        var first = true;
        var inner = new ScriptedBreakerReader(() => { var r = first ? Armed() : Tripped(); first = false; return r; });
        var clock = new TestClock(Phase4Fixtures.T0);
        var cache = new BreakerCache(inner, clock);
        var cohort = Phase4Fixtures.Cohort();

        Assert.Equal(BreakerState.Armed, (await cache.ReadAsync(cohort)).State);
        clock.Advance(TimeSpan.FromSeconds(61));
        Assert.Equal(BreakerState.Tripped, (await cache.ReadAsync(cohort)).State);   // refreshed, not stale-armed
    }

    /// <summary>The cache exposes read only — there is no write path to breaker state on C2's surface.</summary>
    [Fact]
    public void BreakerCache_ExposesReadOnly()
    {
        var methods = typeof(BreakerCache)
            .GetMethods(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.DeclaredOnly)
            .Where(m => !m.IsSpecialName)
            .Select(m => m.Name)
            .ToArray();

        Assert.Equal(["ReadAsync"], methods);
    }
}
