using UgcIntelligence.Domain.Entities;

namespace UgcIntelligence.C2.Api.Scoring;

/// <summary>The BAS and its five component scores, for auditability and the stored score record.</summary>
public sealed record BriefAdherence(decimal Bas, IReadOnlyDictionary<string, decimal> Components);

/// <summary>
/// P3-T4 (BAS). The Brief Adherence lane. Four of the five components are deterministic, computed in C#
/// from the submission text and the brief's stored requirements; only <c>tone_register_match</c> is a
/// model judgement. <strong>Talking-point coverage is decided by code</strong> (the model may assist
/// semantic matching, but the coverage number is deterministic), and format adherence is checked
/// against the brief's stored text, never a live trend lookup.
/// </summary>
public static class BriefAdherenceLane
{
    /// <summary>
    /// Compute the BAS. <paramref name="toneRegisterMatch"/> is the model's 0–100 tone score (the only
    /// non-deterministic component); everything else is derived from stored records and the submission.
    /// </summary>
    public static BriefAdherence Compute(
        Submission submission,
        Brief brief,
        FeatureRecord? features,
        decimal toneRegisterMatch)
    {
        var content = brief.Content ?? BriefContent.Empty;
        var text = BuildText(submission, features);

        var components = new Dictionary<string, decimal>
        {
            [Composition.TalkingPointsCovered] = CoverageFraction(content.RequiredTalkingPoints, text) * 100m,
            [Composition.MandatoryInclusions] = CoverageFraction(content.MandatoryInclusions, text) * 100m,
            [Composition.ProhibitedContentAbsent] = ProhibitedAbsent(content.ProhibitedTerms, text) ? 100m : 0m,
            [Composition.FormatSpecMet] = FormatMet(content.RequiredAspectRatio, features) ? 100m : 0m,
            [Composition.ToneRegisterMatch] = Composition.Clamp(toneRegisterMatch),
        };

        return new BriefAdherence(Composition.ComposeBas(components), components);
    }

    private static string BuildText(Submission submission, FeatureRecord? features)
    {
        var onScreen = features is null ? null : string.Join(' ', features.OnScreenText.Select(s => s.Text));
        return string.Join(' ', new[] { submission.Caption, onScreen, features?.Transcript }
            .Where(s => !string.IsNullOrWhiteSpace(s))).ToLowerInvariant();
    }

    /// <summary>Code decides coverage: the fraction of required items found in the text. No requirement ⇒ fully met.</summary>
    private static decimal CoverageFraction(IReadOnlyList<string> required, string text)
    {
        if (required.Count == 0) return 1m;
        var found = required.Count(item => text.Contains(item.ToLowerInvariant(), StringComparison.Ordinal));
        return (decimal)found / required.Count;
    }

    private static bool ProhibitedAbsent(IReadOnlyList<string> prohibited, string text) =>
        !prohibited.Any(term => !string.IsNullOrWhiteSpace(term) && text.Contains(term.ToLowerInvariant(), StringComparison.Ordinal));

    /// <summary>Format is met when no format is required, or the extracted aspect ratio matches the brief's stored value.</summary>
    private static bool FormatMet(string? requiredAspectRatio, FeatureRecord? features)
    {
        if (requiredAspectRatio is null) return true;                 // no requirement is not a failed check
        return features?.AspectRatio is { } ar
            && string.Equals(ar, requiredAspectRatio, StringComparison.OrdinalIgnoreCase);
    }
}
