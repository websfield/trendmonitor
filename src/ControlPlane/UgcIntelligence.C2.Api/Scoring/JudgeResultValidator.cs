namespace UgcIntelligence.C2.Api.Scoring;

/// <summary>The validated, clamped criterion scores plus whether any raw score was out of range.</summary>
public sealed record ValidatedScores(IReadOnlyDictionary<string, CriterionScore> Criteria, bool Anomalous);

/// <summary>
/// P3-T3. Strict validation of a <see cref="JudgeResult"/>. Two failure classes are handled differently:
///
/// <list type="bullet">
/// <item><strong>Schema failure</strong> — a required criterion is missing or its evidence is empty.
/// This is unparseable output: the caller retries once with a reminder, and a second failure yields
/// <c>NEEDS_REVIEW</c>. Never a default score.</item>
/// <item><strong>Out-of-range score</strong> — the JSON is well-formed but a score is outside 0–100. It
/// is clamped, and the whole result is flagged <c>anomalous</c>. An anomalous score is stored but
/// <strong>excluded from the calibration dataset</strong> (the same discipline that excludes a
/// V6-excluded submission). This is <em>not</em> a schema failure and does not trigger a retry.</item>
/// </list>
/// </summary>
public static class JudgeResultValidator
{
    /// <summary>The criteria a valid result must carry: the eight VPS criteria plus the model's BAS tone component.</summary>
    public static readonly IReadOnlySet<string> RequiredCriteria =
        new HashSet<string>(Composition.VpsWeights.Keys) { Composition.ToneRegisterMatch };

    /// <summary>
    /// Validate and clamp. Returns false on a schema failure (missing criterion or empty evidence),
    /// setting <paramref name="failure"/>. On success, scores are clamped 0–100 and
    /// <see cref="ValidatedScores.Anomalous"/> is true iff any raw score was out of range.
    /// </summary>
    public static bool TryValidate(JudgeResult result, out ValidatedScores validated, out string? failure)
    {
        validated = null!;
        failure = null;
        ArgumentNullException.ThrowIfNull(result);

        // #5 fail-closed: the type permits a null Criteria map even though OfflineJudge never produces one.
        // A live judge that returns one is unparseable output — a schema failure, not an NRE that escapes
        // the documented degrade-to-NEEDS_REVIEW contract.
        if (result.Criteria is null)
        {
            failure = "model output has a null criteria map";
            return false;
        }

        var missing = RequiredCriteria.Where(k => !result.Criteria.ContainsKey(k)).ToList();
        if (missing.Count > 0)
        {
            failure = $"model output missing required criterion/criteria: {string.Join(", ", missing)}";
            return false;
        }

        var emptyEvidence = RequiredCriteria
            .Where(k => string.IsNullOrWhiteSpace(result.Criteria[k].Evidence))
            .ToList();
        if (emptyEvidence.Count > 0)
        {
            failure = $"model output has empty evidence for: {string.Join(", ", emptyEvidence)}";
            return false;
        }

        var anomalous = false;
        var clamped = new Dictionary<string, CriterionScore>();
        foreach (var (key, cs) in result.Criteria)
        {
            if (cs.Score < 0m || cs.Score > 100m) anomalous = true;   // out of range: clamp + flag, do not retry
            clamped[key] = cs with { Score = Composition.Clamp(cs.Score) };
        }

        validated = new ValidatedScores(clamped, anomalous);
        return true;
    }
}
