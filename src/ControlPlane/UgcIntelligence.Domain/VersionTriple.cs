namespace UgcIntelligence.Domain;

/// <summary>
/// REQ-004. Pinned at score time. Re-running the score tomorrow against the same triple
/// yields the same number — which is what makes a historical decision reconstructible.
/// </summary>
public readonly record struct VersionTriple(
    string ExtractorVersion,
    string RubricVersion,
    string PatternLibraryVersion)
{
    /// <summary>
    /// A library mined over extractor 3.2 features cannot score a FeatureRecord produced by
    /// extractor 4.0. C2 enforces this at read time rather than documenting it; on mismatch the
    /// cohort fails to <c>cold</c> and alerts. It never scores against an incompatible library.
    /// </summary>
    public bool IsCompatibleWith(IReadOnlyList<string> compatibleExtractorVersions)
    {
        var extractorVersion = ExtractorVersion;   // a lambda in a struct cannot capture `this`
        return compatibleExtractorVersions.Any(pattern => MatchesSemverPattern(extractorVersion, pattern));
    }

    private static bool MatchesSemverPattern(string version, string pattern)
    {
        if (pattern == version) return true;
        if (!pattern.EndsWith(".x", StringComparison.Ordinal)) return false;
        var prefix = pattern[..^1];               // "3.2.x" -> "3.2."
        return version.StartsWith(prefix, StringComparison.Ordinal);
    }
}

/// <summary>
/// The calibration cohort key (Contract C).
///
/// <para>
/// The library version is part of the key, and that is the point: a breaker state is a claim about
/// how well <em>this specific scorer configuration</em> predicts outcomes in <em>this specific cohort</em>.
/// Swap the library and the claim no longer applies — which is why library promotion resets the
/// calibration window, and why promotion is expensive.
/// </para>
/// </summary>
public readonly record struct CohortKey(
    Guid TenantId,
    string Vertical,
    string Platform,
    string RubricVersion,
    string PatternLibraryVersion)
{
    public override string ToString() =>
        $"{TenantId}:{Vertical}:{Platform}:{RubricVersion}:{PatternLibraryVersion}";
}
