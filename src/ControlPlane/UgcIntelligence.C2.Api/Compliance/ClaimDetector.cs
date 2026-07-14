namespace UgcIntelligence.C2.Api.Compliance;

/// <summary>
/// Deterministic product-claim detection over creator text. Shared by V1 (does the content make a
/// product claim, so a disclosure is required?) and V2 (is every claim traceable to the ledger?).
///
/// <para>The carve-out is the discipline: <em>opinion or experience asserting no product property is
/// not a claim.</em> "I liked it" is not a claim; "clinically proven" is. This is a rule, not a model
/// judgement — the text is untrusted data (ADR-0002), evaluated, never obeyed.</para>
/// </summary>
public static class ClaimDetector
{
    /// <summary>
    /// Phrases that assert a product <em>property</em> — efficacy, certification, superlative, or a
    /// measurable outcome. Presence of any of these is a product claim that must be substantiated.
    /// </summary>
    private static readonly string[] ClaimPhrases =
    [
        "clinically proven", "clinically tested", "scientifically proven", "proven to", "proven",
        "dermatologist recommended", "dermatologist tested", "doctor recommended",
        "cures", "cure", "treats", "heals", "eliminates", "removes", "reduces", "prevents",
        "guaranteed", "guarantee", "100%", "no.1", "number one", "number 1",
        "spf", "anti-aging", "anti-ageing", "hypoallergenic", "non-toxic", "chemical-free",
        "results in", "instant results", "fastest", "clinically",
    ];

    /// <summary>
    /// Markers of opinion or personal experience. A sentence carrying one of these, and no
    /// <see cref="ClaimPhrases"/>, is not a product claim.
    /// </summary>
    private static readonly string[] OpinionMarkers =
    [
        "i liked", "i like", "i love", "i loved", "my favourite", "my favorite",
        "in my opinion", "i think", "i feel", "for me", "personally", "i enjoy",
    ];

    /// <summary>The distinct product claims found across the supplied text fragments (case-insensitive).</summary>
    public static IReadOnlyList<string> DetectClaims(params string?[] fragments)
    {
        var found = new List<string>();
        foreach (var fragment in fragments)
        {
            if (string.IsNullOrWhiteSpace(fragment)) continue;
            var lower = fragment.ToLowerInvariant();
            foreach (var phrase in ClaimPhrases)
            {
                if (!ContainsWholePhrase(lower, phrase)) continue;
                // An opinion marker attached to the same text does not neutralise a hard efficacy claim:
                // "I love it, clinically proven" still asserts a property. Only mark opinion-only text as safe.
                if (!found.Contains(phrase, StringComparer.OrdinalIgnoreCase)) found.Add(phrase);
            }
        }
        return found;
    }

    /// <summary>True when any supplied fragment makes a product claim.</summary>
    public static bool MakesProductClaim(params string?[] fragments) => DetectClaims(fragments).Count > 0;

    /// <summary>True when the text is purely opinion/experience with no product claim.</summary>
    public static bool IsOpinionOnly(string? text) =>
        !string.IsNullOrWhiteSpace(text)
        && OpinionMarkers.Any(m => text.ToLowerInvariant().Contains(m, StringComparison.Ordinal))
        && !MakesProductClaim(text);

    /// <summary>
    /// A claim is traceable when the ledger contains an approved claim covering it (case-insensitive
    /// substring, either direction — the ledger phrasing may be broader or narrower than the caption).
    /// </summary>
    public static bool IsTraceable(string claim, IReadOnlyList<string> approvedClaims) =>
        approvedClaims.Any(approved =>
            approved.Contains(claim, StringComparison.OrdinalIgnoreCase) ||
            claim.Contains(approved, StringComparison.OrdinalIgnoreCase));

    private static bool ContainsWholePhrase(string lowerHaystack, string lowerPhrase)
    {
        var idx = 0;
        while ((idx = lowerHaystack.IndexOf(lowerPhrase, idx, StringComparison.Ordinal)) >= 0)
        {
            var before = idx == 0 || !char.IsLetterOrDigit(lowerHaystack[idx - 1]);
            var afterPos = idx + lowerPhrase.Length;
            var after = afterPos >= lowerHaystack.Length || !char.IsLetterOrDigit(lowerHaystack[afterPos]);
            if (before && after) return true;
            idx = afterPos;
        }
        return false;
    }
}
