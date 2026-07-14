using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Events;
using UgcIntelligence.C2.Api.Scoring;
using UgcIntelligence.C2.Api.Verdicts;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain.Entities;
using UgcIntelligence.Events;
using UgcIntelligence.Events.Writer;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// P3-T5 failure modes. The scoring lane fails closed: a model that is down, or returns malformed output
/// twice, degrades to NEEDS_REVIEW — never a default score, never an approval — while the Phase 1
/// compliance result still returns.
/// </summary>
public sealed class ScoringServiceTests
{
    private sealed record Rig(ScoringService Service, AppendOnlyEventLog Log);

    private static Rig NewRig(IJudge judge)
    {
        var log = new AppendOnlyEventLog();
        var emitter = new ComplianceEventEmitter(new OutcomeEventWriter(log));
        return new Rig(new ScoringService(judge, emitter), log);
    }

    private static Task<ScoringResult> Score(
        Rig rig,
        FeatureRecord? features = null,
        ComplianceResult? compliance = null,
        IReadOnlyList<string>? libraryCompatibleExtractors = null,
        UgcIntelligence.Domain.VersionTriple? triple = null,
        BreakerState? breaker = null)
    {
        var sub = Phase1Fixtures.Submission();
        return rig.Service.ScoreAsync(
            compliance ?? Phase3Fixtures.CleanCompliance(),
            sub,
            Phase1Fixtures.BriefNoRequirements(),
            features ?? Phase3Fixtures.Features(),
            Phase3Fixtures.Prompt(),
            triple ?? Phase3Fixtures.Triple,
            Phase3Fixtures.Cohort,
            libraryCompatibleExtractors ?? Phase3Fixtures.CompatibleExtractors,
            breaker,
            occurredAt: Phase1Fixtures.Now);
    }

    [Fact]
    public async Task Judge_Down_NeedsReview_ComplianceStillReturns()
    {
        var compliance = Phase3Fixtures.CleanCompliance();
        var rig = NewRig(Phase3Fixtures.JudgeThrowing(() => new JudgeUnavailableException("timeout")));

        var result = await Score(rig, compliance: compliance);

        Assert.False(result.Scored);
        Assert.Equal(Verdict.NEEDS_REVIEW, result.Verdict);
        Assert.Same(compliance, result.Compliance);          // compliance is unaffected and still returned
        Assert.Contains("judge_unavailable", result.Reasons);
        Assert.Equal(0, rig.Log.Count);                      // no score persisted
    }

    [Fact]
    public async Task Judge_InvalidJsonTwice_NeedsReview()
    {
        var rig = NewRig(Phase3Fixtures.JudgeThrowing(() => new JudgeSchemaException("not json")));

        var result = await Score(rig);

        Assert.False(result.Scored);
        Assert.Equal(Verdict.NEEDS_REVIEW, result.Verdict);
        Assert.Contains("model_schema_invalid_twice", result.Reasons);
        Assert.Equal(0, rig.Log.Count);                      // no default score persisted
    }

    [Fact]
    public async Task Judge_SchemaFailsOnce_ThenSucceeds_IsScored()
    {
        var judge = Phase3Fixtures.JudgeFailingThenSucceeding(
            failFirst: 1, () => new JudgeSchemaException("bad"), Phase3Fixtures.Judged(fill: 85m));
        var rig = NewRig(judge);

        var result = await Score(rig);

        Assert.True(result.Scored);                          // retry-once recovered
        Assert.Equal(1, rig.Log.Count);
    }

    [Fact]
    public async Task Score_OutOfRange_ClampedAndExcluded()
    {
        var judged = Phase3Fixtures.Judged(fill: 80m,
            overrides: new Dictionary<string, decimal> { [Composition.HookStrength] = 137m });
        var rig = NewRig(Phase3Fixtures.JudgeReturning(judged));

        var result = await Score(rig);

        Assert.True(result.Scored);
        Assert.True(result.Anomalous);                       // out of range flagged
        Assert.False(result.EntersCalibrationDataset);       // excluded from calibration
        Assert.Equal(100m, result.Criteria![Composition.HookStrength].Score);   // clamped 137 -> 100

        var scored = await SingleScored(rig.Log);
        Assert.Equal(true, scored.Payload["anomalous"]);
    }

    [Fact]
    public async Task Score_ParseFailsTwice_AndDegraded_NeedsReview()
    {
        var rig = NewRig(Phase3Fixtures.JudgeThrowing(() => new JudgeSchemaException("bad")));

        var result = await Score(rig, features: Phase3Fixtures.Features(audioPresent: false));

        Assert.False(result.Scored);
        Assert.Equal(Verdict.NEEDS_REVIEW, result.Verdict);
        Assert.Contains("model_schema_invalid_twice", result.Reasons);   // both reasons present
        Assert.Contains("audio_degraded", result.Reasons);
    }

    [Fact]
    public async Task Breaker_Unreachable_TreatedAsCold()
    {
        // A null breaker read (unreachable / cache stale > 60s in Phase 4) fails closed to cold.
        var rig = NewRig(Phase3Fixtures.JudgeReturning(Phase3Fixtures.Judged()));

        var result = await Score(rig, breaker: null);

        Assert.Equal(BreakerState.Cold, result.BreakerState);
    }

    [Fact]
    public async Task Library_Absent_ScoresUnanchored()
    {
        // No library for the cohort: score unanchored, advisory. Do not block, do not error, do not invent one.
        var rig = NewRig(Phase3Fixtures.JudgeReturning(Phase3Fixtures.Judged()));

        var result = await Score(rig, libraryCompatibleExtractors: null);

        Assert.True(result.Scored);
        Assert.Equal(BreakerState.Cold, result.BreakerState);
    }

    [Fact]
    public async Task VersionTriple_Mismatch_FailsToCold()
    {
        // The score's extractor is not compatible with the library: cohort → cold, alert. Never anchor to it.
        var incompatible = new UgcIntelligence.Domain.VersionTriple("4.0.0", "1.1.0", "beauty.tiktok.v7");
        var rig = NewRig(Phase3Fixtures.JudgeReturning(Phase3Fixtures.Judged()));

        var result = await Score(rig, triple: incompatible, breaker: BreakerState.Armed);

        Assert.Equal(BreakerState.Cold, result.BreakerState);   // armed read ignored on mismatch
        Assert.Contains(result.Reasons, r => r.Contains("version_triple_mismatch", StringComparison.Ordinal));
    }

    /// <summary>
    /// REQ-018. Audio absent ⇒ the audio-dependent criteria are stored <c>degraded:true</c> in code, even
    /// when the model self-reports <c>degraded:false</c>. A non-audio-dependent criterion keeps the model's
    /// report. The model may raise a degradation, never clear one the missing audio implies.
    /// </summary>
    [Fact]
    public async Task AudioAbsent_ForcesDegraded_EvenWhenModelSaysOtherwise()
    {
        // The model claims NOTHING is degraded, but audio is absent.
        var judged = Phase3Fixtures.Judged(fill: 80m, degraded: false);
        var rig = NewRig(Phase3Fixtures.JudgeReturning(judged));

        var result = await Score(rig, features: Phase3Fixtures.Features(audioPresent: false));

        // On the result: audio-dependent criteria forced degraded; a non-audio-dependent one stays as reported.
        Assert.True(result.Criteria![Composition.HookStrength].Degraded);
        Assert.True(result.Criteria[Composition.CompletionLikelihood].Degraded);
        Assert.True(result.Criteria[Composition.EmotionalSpecificity].Degraded);
        Assert.False(result.Criteria[Composition.TextReadability].Degraded);   // not audio-dependent; model's false stands

        // And on the STORED SubmissionScored event — the flag's honesty is what feeds downstream calibration.
        var scored = await SingleScored(rig.Log);
        var criteria = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(scored.Payload["criteria"]);
        foreach (var key in new[] { Composition.HookStrength, Composition.CompletionLikelihood, Composition.EmotionalSpecificity })
        {
            var cs = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(criteria[key]);
            Assert.Equal(true, cs["degraded"]);
        }
        var readability = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(criteria[Composition.TextReadability]);
        Assert.Equal(false, readability["degraded"]);
    }

    /// <summary>Audio present ⇒ the model's self-report stands, and it may still raise a degradation.</summary>
    [Fact]
    public async Task AudioPresent_HonoursModelDegradedFlag()
    {
        var judged = Phase3Fixtures.Judged(fill: 80m, degraded: true);   // model raises degradation
        var rig = NewRig(Phase3Fixtures.JudgeReturning(judged));

        var result = await Score(rig, features: Phase3Fixtures.Features(audioPresent: true));

        Assert.True(result.Criteria![Composition.TextReadability].Degraded);   // model-raised degradation is honoured
    }

    /// <summary>
    /// A V6-excluded minor never enters AI scoring: the model is not called and no SubmissionScored is
    /// emitted. The judge throws if invoked, proving it is not reached.
    /// </summary>
    [Fact]
    public async Task V6Excluded_IsNotScored_ModelNotCalled()
    {
        var judgeThatMustNotRun = Phase3Fixtures.JudgeThrowing(() => new InvalidOperationException("judge must not be called for a V6-excluded submission"));
        var rig = NewRig(judgeThatMustNotRun);
        var v6Fired = new ComplianceResult([
            .. Phase1Fixtures.AllPass().Take(5), VetoResult.Fire("V6", "creator is 15")]);

        var result = await Score(rig, compliance: v6Fired);

        Assert.False(result.Scored);
        Assert.Equal(Verdict.EXCLUDED_FROM_AI_SCORING, result.Verdict);
        Assert.False(result.EntersCalibrationDataset);
        Assert.Equal(0, rig.Log.Count);          // no SubmissionScored emitted
    }

    /// <summary>A submission with a fired compliance veto is not scored either — REJECTED comes from compliance alone.</summary>
    [Fact]
    public async Task FiredVeto_IsNotScored_ModelNotCalled()
    {
        var rig = NewRig(Phase3Fixtures.JudgeThrowing(() => new InvalidOperationException("must not be called")));
        var v4Fired = new ComplianceResult([
            .. Phase1Fixtures.AllPass().Take(3), VetoResult.Fire("V4", "no grant"), .. Phase1Fixtures.AllPass().Skip(4)]);

        var result = await Score(rig, compliance: v4Fired);

        Assert.False(result.Scored);
        Assert.Equal(Verdict.REJECTED, result.Verdict);
        Assert.Equal(0, rig.Log.Count);
    }

    /// <summary>
    /// End-to-end: a low hook still gates even when audio was absent and the hook was scored degraded
    /// (suppresses_hard_gate: false). The verdict is REVISIONS_REQUIRED and the score is degraded-flagged.
    /// </summary>
    [Fact]
    public async Task ScoredDegradedLowHook_RevisionsRequired()
    {
        var judged = Phase3Fixtures.Judged(fill: 95m,
            overrides: new Dictionary<string, decimal> { [Composition.HookStrength] = 40m }, degraded: true);
        var rig = NewRig(Phase3Fixtures.JudgeReturning(judged));

        var result = await Score(rig, features: Phase3Fixtures.Features(audioPresent: false));

        Assert.True(result.Scored);
        Assert.Equal(Verdict.REVISIONS_REQUIRED, result.Verdict);
        Assert.Contains("audio_degraded", result.Reasons);
    }

    /// <summary>The model's suspected veto is surfaced on the result and never changes the verdict.</summary>
    [Fact]
    public async Task SuspectedVeto_IsSurfaced_VerdictUnchanged()
    {
        var judged = Phase3Fixtures.Judged(fill: 85m, suspected: ["V1"]);
        var rig = NewRig(Phase3Fixtures.JudgeReturning(judged));

        var result = await Score(rig);   // compliance is clean; a model-raised V1 must not reject

        Assert.Contains("V1", result.SuspectedVetoes);
        Assert.NotEqual(Verdict.REJECTED, result.Verdict);
    }

    private static async Task<OutcomeEvent> SingleScored(AppendOnlyEventLog log)
    {
        var events = new List<OutcomeEvent>();
        await foreach (var e in log.ReplayAsync(Phase1Fixtures.Tenant)) events.Add(e);
        return Assert.Single(events, e => e.EventType == OutcomeEventType.SubmissionScored);
    }
}
