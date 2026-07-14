using System.Text.RegularExpressions;

namespace UgcIntelligence.KnowledgeApi.Serving;

/// <summary>
/// A16, the <strong>second</strong> checkpoint. The forbidden-verb lexicon runs at ratification (the
/// synthesiser) AND at serve time (here). <c>contrasted</c> is the ceiling and is not a causal claim: a
/// statement using <em>causes / lifts / drives / predicts</em> (or their inflections) is not served, even if
/// it somehow slipped ratification. A mechanism describes a structural asymmetry, never an effect.
/// </summary>
public static class ForbiddenVerbLexicon
{
    // Word-boundary matches so "predicts"/"predicted"/"predicting" are caught but "predictable" prose that
    // is actually forbidden is caught too; the lexicon errs toward refusing at serve time.
    private static readonly Regex Forbidden = new(
        @"\b(causes?|caused|causing|lifts?|lifted|lifting|drives?|drove|driven|driving|predicts?|predicted|predicting)\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>True when a statement uses a forbidden causal verb and must not be served.</summary>
    public static bool ContainsForbiddenVerb(string? statement) =>
        !string.IsNullOrWhiteSpace(statement) && Forbidden.IsMatch(statement);

    /// <summary>The forbidden verbs found, for a rejection/audit reason.</summary>
    public static IReadOnlyList<string> Matches(string? statement) =>
        string.IsNullOrWhiteSpace(statement)
            ? []
            : [.. Forbidden.Matches(statement).Select(m => m.Value.ToLowerInvariant()).Distinct()];
}
