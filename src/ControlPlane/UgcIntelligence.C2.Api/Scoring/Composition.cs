namespace UgcIntelligence.C2.Api.Scoring;

/// <summary>
/// P3-T4. VPS and BAS composition — <strong>the composite is computed in C#, never returned by the
/// model</strong> (the model returns criterion scores; the weighted mean executes here).
///
/// <para>The weights below are the values in <c>schemas/rubric-v1.json</c>; <c>CompositionTests</c>
/// reads that file and fails if these constants drift from it, so they are not "hardcoded from memory"
/// — they are pinned to the contract with a test that enforces the pin.</para>
/// </summary>
public static class Composition
{
    // VPS criteria weights (rubric-v1.json `vps.criteria`). Arithmetic mean, not geometric: craft
    // criteria are compensatory within one piece; the one non-compensatory criterion (hook) is handled
    // by the hard gate in the verdict engine, not by punishing the rollup.
    public const string HookStrength = "hook_strength";
    public const string ScrollStopPower = "scroll_stop_power";
    public const string CompletionLikelihood = "completion_likelihood";
    public const string Pacing = "pacing";
    public const string EmotionalSpecificity = "emotional_specificity";
    public const string TextReadability = "text_readability";
    public const string AuthenticityRegister = "authenticity_register";
    public const string Shareability = "shareability";

    /// <summary>VPS weights. <c>shareability</c> is 0.00 — diagnostic only, reported, never weighted.</summary>
    public static readonly IReadOnlyDictionary<string, decimal> VpsWeights = new Dictionary<string, decimal>
    {
        [HookStrength] = 0.20m,
        [ScrollStopPower] = 0.18m,
        [CompletionLikelihood] = 0.18m,
        [Pacing] = 0.14m,
        [EmotionalSpecificity] = 0.14m,
        [TextReadability] = 0.10m,
        [AuthenticityRegister] = 0.06m,
        [Shareability] = 0.00m,
    };

    // BAS components (rubric-v1.json `bas.components`).
    public const string TalkingPointsCovered = "talking_points_covered";
    public const string MandatoryInclusions = "mandatory_inclusions";
    public const string ProhibitedContentAbsent = "prohibited_content_absent";
    public const string FormatSpecMet = "format_spec_met";
    public const string ToneRegisterMatch = "tone_register_match";

    public static readonly IReadOnlyDictionary<string, decimal> BasWeights = new Dictionary<string, decimal>
    {
        [TalkingPointsCovered] = 0.35m,
        [MandatoryInclusions] = 0.25m,
        [ProhibitedContentAbsent] = 0.20m,
        [FormatSpecMet] = 0.10m,
        [ToneRegisterMatch] = 0.10m,
    };

    /// <summary>The eight criteria the judge must return for VPS (includes diagnostic <c>shareability</c>).</summary>
    public static IReadOnlyCollection<string> VpsCriteriaKeys => (IReadOnlyCollection<string>)VpsWeights.Keys;

    /// <summary>
    /// The audio-dependent VPS criteria (<c>rubric-v1.json</c> <c>vps.criteria[].audio_dependent</c>).
    /// When audio is absent these are scored from visual evidence only and <strong>must</strong> be
    /// flagged degraded. <c>CompositionTests</c> asserts this set matches the rubric, so it cannot drift
    /// from the contract — sourced the same way the weights are, not hardcoded as an independent copy.
    /// </summary>
    public static readonly IReadOnlySet<string> AudioDependentCriteria =
        new HashSet<string> { HookStrength, CompletionLikelihood, EmotionalSpecificity };

    /// <summary>
    /// REQ-018. Force <c>degraded = true</c> on the audio-dependent criteria whenever audio is absent,
    /// <strong>in code, regardless of what the model self-reported</strong>. The model may <em>raise</em> a
    /// degradation the audio-presence check would miss, but it can never <em>clear</em> one the missing
    /// audio implies: <c>degraded = model_degraded OR (audio_absent AND criterion_is_audio_dependent)</c>.
    /// This is the compliance thesis applied to confidence — the model may raise, never clear — so a
    /// stored <c>Estimated</c> score never masquerades as full-confidence when audio was gone.
    ///
    /// <para>The rubric's other degradation effect, widening the composite confidence band, is
    /// <strong>deferred to Phase 4</strong> with the breaker bands. The raw <c>audio_present</c> and the
    /// per-criterion <c>degraded</c> flags are stored, so the context to widen the band later survives.</para>
    /// </summary>
    public static IReadOnlyDictionary<string, CriterionScore> ApplyAudioDegradation(
        IReadOnlyDictionary<string, CriterionScore> criteria, bool audioPresent)
    {
        ArgumentNullException.ThrowIfNull(criteria);
        if (audioPresent) return criteria;   // audio present: the model's self-report stands (it may still raise)

        return criteria.ToDictionary(
            kv => kv.Key,
            kv => AudioDependentCriteria.Contains(kv.Key) && !kv.Value.Degraded
                ? kv.Value with { Degraded = true }
                : kv.Value);
    }

    /// <summary>
    /// Compose the VPS from validated criterion scores. Weighted arithmetic mean over the VPS weights,
    /// floor-rounded, clamped 0–100. <c>shareability</c> contributes exactly 0 (weight 0.00). Keys not in
    /// the VPS weight table (e.g. <c>tone_register_match</c>, a BAS component) are ignored.
    /// </summary>
    public static decimal ComposeVps(IReadOnlyDictionary<string, CriterionScore> criteria)
    {
        ArgumentNullException.ThrowIfNull(criteria);
        return ComposeVpsFromScores(criteria.ToDictionary(kv => kv.Key, kv => kv.Value.Score));
    }

    /// <summary>The scalar overload used by the verdict engine, which sees only the numbers, never the model type.</summary>
    public static decimal ComposeVpsFromScores(IReadOnlyDictionary<string, decimal> scores) =>
        WeightedFloor(scores, VpsWeights);

    /// <summary>Compose the BAS from its five component scores. Weighted arithmetic mean, floor, clamp 0–100.</summary>
    public static decimal ComposeBas(IReadOnlyDictionary<string, decimal> components) =>
        WeightedFloor(components, BasWeights);

    private static decimal WeightedFloor(IReadOnlyDictionary<string, decimal> scores, IReadOnlyDictionary<string, decimal> weights)
    {
        ArgumentNullException.ThrowIfNull(scores);
        decimal sum = 0m;
        foreach (var (key, weight) in weights)
        {
            var score = scores.TryGetValue(key, out var s) ? Clamp(s) : 0m;
            sum += weight * score;
        }
        return Math.Floor(Clamp(sum));
    }

    /// <summary>Server-side clamp: a model score outside 0–100 is clamped before it enters any composite.</summary>
    public static decimal Clamp(decimal value) => Math.Clamp(value, 0m, 100m);
}
