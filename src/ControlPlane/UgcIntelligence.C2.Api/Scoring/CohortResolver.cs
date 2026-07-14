using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;

namespace UgcIntelligence.C2.Api.Scoring;

/// <summary>
/// The resolution of a cohort's scoring context. <see cref="Anchored"/> is false when there is no
/// library to anchor against; <see cref="Advisory"/> is true whenever the VPS must not be surfaced as
/// live (anything but <see cref="BreakerState.Armed"/>).
/// </summary>
public sealed record CohortResolution(BreakerState State, bool Anchored, bool Advisory, string? Alert)
{
    /// <summary>The breaker state as the lowercase token the event stream records.</summary>
    public string StateToken => State.ToString().ToLowerInvariant();
}

/// <summary>
/// Resolves the breaker state and anchoring for a score, <strong>failing closed to
/// <see cref="BreakerState.Cold"/></strong>. In Phase 3 the C3 breaker is not wired: an absent read is
/// treated as cold, exactly as an unreachable or stale (&gt; 60s) read will be in Phase 4. This class
/// never invents a library and never returns permission on a missing dependency.
/// </summary>
public static class CohortResolver
{
    /// <summary>
    /// Resolve the scoring context.
    /// <list type="bullet">
    /// <item>No library for the cohort (<paramref name="libraryCompatibleExtractors"/> null) ⇒ score
    /// unanchored, VPS advisory-only, state cold. Do not block, do not error, do not invent a library.</item>
    /// <item>The score's extractor is incompatible with the library ⇒ cold, advisory, alert. Never score
    /// against an incompatible library.</item>
    /// <item>Otherwise, use the breaker read; a null read (unreachable/stale) is cold. VPS is advisory
    /// unless the breaker is armed.</item>
    /// </list>
    /// </summary>
    public static CohortResolution Resolve(
        VersionTriple scoreTriple,
        IReadOnlyList<string>? libraryCompatibleExtractors,
        BreakerState? breakerRead)
    {
        if (libraryCompatibleExtractors is null)
            return new CohortResolution(BreakerState.Cold, Anchored: false, Advisory: true, Alert: null);

        if (!scoreTriple.IsCompatibleWith(libraryCompatibleExtractors))
            return new CohortResolution(BreakerState.Cold, Anchored: false, Advisory: true,
                Alert: $"version_triple_mismatch: extractor {scoreTriple.ExtractorVersion} is not compatible with the library.");

        var state = breakerRead ?? BreakerState.Cold;   // fail closed
        return new CohortResolution(state, Anchored: true, Advisory: state != BreakerState.Armed, Alert: null);
    }
}
