using System.Collections.Concurrent;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;

namespace UgcIntelligence.C2.Api.Breaker;

/// <summary>
/// P4-T5. C2's read-through cache over Contract C, TTL 60 s, <strong>fail-closed to <c>cold</c></strong>.
/// This is the real breaker read that replaces the Phase 3 stub, and it is the only breaker surface C2
/// holds — an <see cref="IBreakerReader"/>, never a write path.
///
/// <para>Fail-closed is the whole point: if C3 is unreachable, or the cached reading is older than the TTL,
/// C2 treats the cohort as <c>cold</c>. It does <strong>not</strong> serve a stale last-known-<c>armed</c>
/// as if it were current — an unreachable referee is never permission. Nothing in a creator submission's
/// critical path depends on C3 being up: scoring and compliance continue, VPS just goes advisory.</para>
///
/// <para>C2 obeys, it does not interpret: there is no config, admin flag, or per-campaign exemption that
/// overrides this. The class exposes read only.</para>
/// </summary>
public sealed class BreakerCache : IBreakerReader
{
    /// <summary>Contract C cache TTL. A reading older than this is stale and yields cold, not its last value.</summary>
    public static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);

    private readonly IBreakerReader _source;
    private readonly TimeProvider _clock;
    private readonly ConcurrentDictionary<string, Entry> _cache = new(StringComparer.Ordinal);

    private readonly record struct Entry(BreakerReading Reading, DateTimeOffset CachedAt);

    /// <param name="source">The upstream reader — in production a proxy to C3's calibration API; a seam here.</param>
    /// <param name="clock">Injectable for testing TTL expiry; defaults to the system clock.</param>
    public BreakerCache(IBreakerReader source, TimeProvider? clock = null)
    {
        _source = source;
        _clock = clock ?? TimeProvider.System;
    }

    public async Task<BreakerReading> ReadAsync(CohortKey cohort, CancellationToken ct = default)
    {
        var now = _clock.GetUtcNow();
        var key = cohort.ToString();

        // A fresh cached reading (within TTL) is served directly.
        if (_cache.TryGetValue(key, out var cached) && now - cached.CachedAt <= Ttl)
            return cached.Reading;

        // Stale or absent: refresh from the source. On any failure, fail closed to cold — never serve the
        // stale entry, and never treat an unreachable referee as permission.
        try
        {
            var reading = await _source.ReadAsync(cohort, ct);
            _cache[key] = new Entry(reading, now);
            return reading;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch
        {
            return BreakerReading.ColdReading("c3_unreachable_fail_closed", now);
        }
    }
}
