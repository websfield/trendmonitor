namespace UgcIntelligence.C2.Api.Scoring;

/// <summary>
/// P3-T2. The deterministic offline fake — <strong>the default DI registration for
/// <see cref="IJudge"/></strong>. It makes no network call. A live provider is config-gated and blocked
/// on the APP 8 cross-border decision; Phase 3 ships the abstraction, not the provider.
///
/// <para>Default behaviour returns a fixed, valid, deterministic result for every criterion, so a
/// developer running the system offline gets a reproducible score with no model and no secret. Tests
/// inject a scripted <c>respond</c> to exercise the failure paths (schema failure, unavailability,
/// out-of-range, suspected vetoes) — the fake simulates those by returning the corresponding result or
/// throwing <see cref="JudgeSchemaException"/> / <see cref="JudgeUnavailableException"/>.</para>
/// </summary>
public sealed class OfflineJudge(Func<FencedPrompt, JudgeResult> respond) : IJudge
{
    /// <summary>The default: a valid, deterministic mid-band score for every required criterion.</summary>
    public OfflineJudge() : this(DefaultRespond) { }

    public Task<JudgeResult> ScoreAsync(FencedPrompt prompt, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        return Task.FromResult(respond(prompt));
    }

    /// <summary>A fixed, valid result: every required criterion at 72, non-empty evidence, no suspected vetoes.</summary>
    public static JudgeResult DefaultRespond(FencedPrompt _)
    {
        var criteria = JudgeResultValidator.RequiredCriteria.ToDictionary(
            key => key,
            key => new CriterionScore(72m, $"offline deterministic score for {key}", Degraded: false));
        return new JudgeResult(criteria, SuspectedVetoes: []);
    }

    /// <summary>Test helper: a result with the given per-criterion scores (all other criteria at 70), degraded flag optional.</summary>
    public static JudgeResult Scores(IReadOnlyDictionary<string, decimal> overrides, bool degraded = false, IReadOnlyList<string>? suspected = null)
    {
        var criteria = JudgeResultValidator.RequiredCriteria.ToDictionary(
            key => key,
            key => new CriterionScore(overrides.TryGetValue(key, out var s) ? s : 70m,
                $"evidence for {key}", Degraded: degraded));
        return new JudgeResult(criteria, suspected ?? []);
    }
}
