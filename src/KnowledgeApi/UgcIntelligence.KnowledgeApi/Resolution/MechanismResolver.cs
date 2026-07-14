using System.Collections.Concurrent;
using UgcIntelligence.Artefacts;
using UgcIntelligence.Contracts.Mechanisms;

namespace UgcIntelligence.KnowledgeApi.Resolution;

/// <summary>How a resolution ended. Each maps to a specific, non-500 client behaviour.</summary>
public enum ResolveStatus
{
    /// <summary>Fresh, sha256-verified library.</summary>
    Resolved,

    /// <summary>No active_version for the cohort. 200 with an empty collection and coverage=no_library — not a 404.</summary>
    NoLibrary,

    /// <summary>Store unreachable, last verified cache served with a <c>stale_as_of</c> stamp.</summary>
    ServedStale,

    /// <summary>sha256 mismatch (P1): the mutated artefact was refused and the previous verified version is served.</summary>
    ServedPreviousAfterMismatch,

    /// <summary>sha256 mismatch (P1) and no previous verified version to fall back on. 503 with a reason.</summary>
    RefusedHashMismatch,

    /// <summary>Store unreachable and no cache. 503 with a reason — never a bare 500.</summary>
    StoreUnreachable,
}

/// <summary>The outcome of resolving a cohort's library, with the P1/stale context the composer needs.</summary>
public sealed record ResolveResult(
    MechanismLibrary? Library,
    ResolveStatus Status,
    DateTimeOffset? StaleAsOf,
    string? Alarm);

/// <summary>
/// P8-T9 resolver. Resolves <c>active_version</c> for a <c>(vertical, platform)</c> cohort, loads the
/// immutable artefact, <strong>verifies sha256, and refuses on mismatch</strong> (serving the previous
/// verified version and alarming P1). On store-unreachable it serves the last verified cache stamped
/// <c>stale_as_of</c>, or — with no cache — surfaces a 503 with a reason, never a bare 500.
///
/// <para>Immutability makes caching free: an artefact is content-addressed, so a version once verified is
/// reconstructible forever, which is exactly what lets the cache stand in for the store when it is down.</para>
/// </summary>
public sealed class MechanismResolver(IMechanismArtefactReader reader, TimeProvider? clock = null)
{
    private readonly TimeProvider _clock = clock ?? TimeProvider.System;
    private readonly ConcurrentDictionary<string, Cached> _cache = new(StringComparer.Ordinal);

    private readonly record struct Cached(MechanismLibrary Library, DateTimeOffset VerifiedAt);

    public static string KeyFor(string vertical, string platform) => $"{vertical}.{platform}";

    /// <summary>Resolve the active library for a cohort.</summary>
    public ResolveResult Resolve(string vertical, string platform) => ResolveByKey(KeyFor(vertical, platform));

    /// <summary>
    /// Resolve by an arbitrary pointer key — a cohort key (<c>beauty.tiktok</c>) or a specific version key
    /// (<c>beauty.tiktok.m3</c>), the latter for <c>/libraries/{version}</c> and history walks. Same
    /// sha256-verify, refuse-on-mismatch, and stale-cache discipline.
    /// </summary>
    public ResolveResult ResolveByKey(string key)
    {
        string? sha;
        try
        {
            sha = reader.ResolveActiveVersion(key);
        }
        catch (MechanismStoreUnreachableException ex)
        {
            return FallBack(key, ex.Message);
        }

        if (sha is null)
            return new ResolveResult(null, ResolveStatus.NoLibrary, null, null);

        string content;
        try
        {
            content = reader.Read(sha);
        }
        catch (ArtefactHashMismatchException ex)
        {
            // Refuse the mutated artefact; serve the previous verified version if we have one; alarm P1.
            if (_cache.TryGetValue(key, out var prev))
                return new ResolveResult(prev.Library, ResolveStatus.ServedPreviousAfterMismatch, prev.VerifiedAt, ex.Message);
            return new ResolveResult(null, ResolveStatus.RefusedHashMismatch, null, ex.Message);
        }
        catch (ArtefactNotFoundException)
        {
            return new ResolveResult(null, ResolveStatus.NoLibrary, null, null);
        }
        catch (MechanismStoreUnreachableException ex)
        {
            return FallBack(key, ex.Message);
        }

        var library = MechanismLibrary.Parse(content);
        _cache[key] = new Cached(library, _clock.GetUtcNow());
        return new ResolveResult(library, ResolveStatus.Resolved, null, null);
    }

    private ResolveResult FallBack(string key, string reason)
    {
        if (_cache.TryGetValue(key, out var cached))
            return new ResolveResult(cached.Library, ResolveStatus.ServedStale, cached.VerifiedAt,
                "store_unreachable: serving the last verified cache");
        return new ResolveResult(null, ResolveStatus.StoreUnreachable, null, $"store_unreachable: {reason}");
    }
}
