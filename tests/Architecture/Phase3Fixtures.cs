using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Scoring;
using UgcIntelligence.Domain;
using UgcIntelligence.Domain.Entities;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>Deterministic fixtures for the Phase 3 scoring suite. No clock, no model, no DB.</summary>
internal static class Phase3Fixtures
{
    public static readonly VersionTriple Triple = new("3.2.1", "1.1.0", "beauty.tiktok.v7");
    public static readonly IReadOnlyList<string> CompatibleExtractors = ["3.2.x"];

    public static CohortKey Cohort => new(Phase1Fixtures.Tenant, "beauty", "tiktok", "1.1.0", "beauty.tiktok.v7");

    public static ComplianceResult CleanCompliance() => new(Phase1Fixtures.AllPass());

    public static FeatureRecord Features(bool audioPresent = true) =>
        new(Guid.NewGuid(), Guid.NewGuid(), "3.2.1", audioPresent, 30, "9:16", 1080, 1920,
            "here is the product", [], []);

    public static FencedPrompt Prompt() => FencedPrompt.Build(
        "Score this submission against the rubric.",
        ["Brief: a beauty serum for tired skin."],
        Untrusted<string>.Mark("here is the product"),
        Untrusted<string>.Mark(""),
        Untrusted<string>.Mark("loving this #ad"));

    /// <summary>All required criteria at <paramref name="fill"/>, with the named overrides applied.</summary>
    public static JudgeResult Judged(decimal fill = 80m, IReadOnlyDictionary<string, decimal>? overrides = null,
        bool degraded = false, IReadOnlyList<string>? suspected = null)
    {
        var criteria = JudgeResultValidator.RequiredCriteria.ToDictionary(
            key => key,
            key => new CriterionScore(overrides is not null && overrides.TryGetValue(key, out var s) ? s : fill,
                $"evidence for {key}", degraded));
        return new JudgeResult(criteria, suspected ?? []);
    }

    /// <summary>A judge that returns a fixed valid result.</summary>
    public static IJudge JudgeReturning(JudgeResult result) => new OfflineJudge(_ => result);

    /// <summary>A judge that throws, e.g. unavailable or schema failure.</summary>
    public static IJudge JudgeThrowing(Func<Exception> ex) => new OfflineJudge(_ => throw ex());

    /// <summary>A stateful judge: throws <paramref name="failFirst"/> times, then returns <paramref name="then"/>.</summary>
    public static IJudge JudgeFailingThenSucceeding(int failFirst, Func<Exception> ex, JudgeResult then)
    {
        var calls = 0;
        return new OfflineJudge(_ => calls++ < failFirst ? throw ex() : then);
    }
}
