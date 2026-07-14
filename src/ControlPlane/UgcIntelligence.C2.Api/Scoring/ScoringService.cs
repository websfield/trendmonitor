using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Events;
using UgcIntelligence.C2.Api.Verdicts;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;
using UgcIntelligence.Domain.Entities;

namespace UgcIntelligence.C2.Api.Scoring;

/// <summary>
/// The outcome of a Gate A scoring run. Carries the Phase 1 <see cref="Compliance"/> result unchanged —
/// <strong>nothing in a creator submission's critical path depends on the model being up</strong>, so a
/// judge failure degrades the score to <c>NEEDS_REVIEW</c> while the compliance result still returns.
/// </summary>
public sealed record ScoringResult(
    ComplianceResult Compliance,
    Verdict Verdict,
    bool Scored,
    decimal? Vps,
    decimal? Bas,
    IReadOnlyDictionary<string, CriterionScore>? Criteria,
    IReadOnlyList<string> SuspectedVetoes,
    bool Anomalous,
    BreakerState BreakerState,
    IReadOnlyList<string> Reasons)
{
    /// <summary>A score enters calibration only if it was produced, is not anomalous, and is not V6-excluded.</summary>
    public bool EntersCalibrationDataset => Scored && VerdictEngine.EntersCalibrationDataset(Verdict, Anomalous);
}

/// <summary>
/// P3-T5. Orchestrates a Gate A score: resolve the cohort (fail closed to <c>cold</c>), call the judge
/// with retry-once on a schema failure, validate + clamp, compose VPS/BAS in C#, resolve the verdict via
/// the pure <see cref="VerdictEngine"/>, and emit <c>SubmissionScored</c> for a produced score.
///
/// <para>The judge output flows as plain numbers into composition and the verdict; the model's
/// <c>JudgeResult</c> type never reaches <see cref="ComplianceGate"/> or <see cref="VerdictEngine"/>, and
/// the model's suspected vetoes are carried as surfaced context, never read by the decision (Rule 1).</para>
/// </summary>
public sealed class ScoringService(IJudge judge, ComplianceEventEmitter emitter)
{
    public async Task<ScoringResult> ScoreAsync(
        ComplianceResult compliance,
        Submission submission,
        Brief brief,
        FeatureRecord features,
        FencedPrompt prompt,
        VersionTriple scoreTriple,
        CohortKey cohortKey,
        IReadOnlyList<string>? libraryCompatibleExtractors,
        BreakerState? breakerRead,
        DateTimeOffset occurredAt,
        CancellationToken ct = default)
    {
        var cohort = CohortResolver.Resolve(scoreTriple, libraryCompatibleExtractors, breakerRead);
        var reasons = new List<string>();
        if (cohort.Alert is not null) reasons.Add(cohort.Alert);

        // A submission that has not cleared compliance never enters AI scoring: the model is not called,
        // and no SubmissionScored is emitted. This is what keeps a V6-excluded minor out of the scoring
        // path (and out of the calibration dataset) — a different act, with a different record, from a
        // rejected or held submission. The verdict comes from the deterministic compliance branch alone.
        if (compliance.AnyFired || compliance.AnyUnevaluable)
        {
            reasons.Add("not_scored_compliance");
            return new ScoringResult(compliance, VerdictEngine.Resolve(compliance), Scored: false, Vps: null,
                Bas: null, Criteria: null, SuspectedVetoes: [], Anomalous: false, cohort.State, reasons);
        }

        if (!features.AudioPresent) reasons.Add("audio_degraded");   // degraded extraction is recorded, not hidden

        var attempt = await TryScoreWithRetryAsync(prompt, ct);

        // Fail closed: judge down, or two schema failures → NEEDS_REVIEW, no score persisted. Never a default score.
        if (attempt.Outcome is Outcome.Unavailable or Outcome.SchemaFailedTwice)
        {
            reasons.Add(attempt.Outcome == Outcome.Unavailable ? "judge_unavailable" : "model_schema_invalid_twice");
            var routed = VerdictEngine.Resolve(compliance);   // bas null → NEEDS_REVIEW (or REJECTED/EXCLUDED from compliance)
            return new ScoringResult(compliance, routed, Scored: false, Vps: null, Bas: null, Criteria: null,
                attempt.Suspected, Anomalous: false, cohort.State, reasons);
        }

        var validated = attempt.Validated!;

        // REQ-018: enforce audio degradation in code. When audio is absent the audio-dependent criteria are
        // flagged degraded regardless of the model's self-report — the model may raise a degradation, never
        // clear one the missing audio implies. This keeps the stored Estimated score honest.
        var criteria = Composition.ApplyAudioDegradation(validated.Criteria, features.AudioPresent);

        var vps = Composition.ComposeVps(criteria);
        var tone = criteria[Composition.ToneRegisterMatch].Score;
        var adherence = BriefAdherenceLane.Compute(submission, brief, features, tone);
        var scores = criteria.ToDictionary(kv => kv.Key, kv => kv.Value.Score);
        var verdict = VerdictEngine.Resolve(compliance, adherence.Bas, scores);

        // An anomalous score IS stored (with the flag); consumers exclude it from calibration. A produced
        // score always pins its VersionTriple and breaker_state_at_score.
        await emitter.EmitSubmissionScoredAsync(new SubmissionScoredRecord(
            submission.Id, cohortKey.TenantId, features.Id, cohortKey, scoreTriple, cohort.State,
            vps, adherence.Bas, criteria, validated.Anomalous, features.AudioPresent, occurredAt), ct);

        return new ScoringResult(compliance, verdict, Scored: true, vps, adherence.Bas, criteria,
            attempt.Suspected, validated.Anomalous, cohort.State, reasons);
    }

    private enum Outcome { Validated, Unavailable, SchemaFailedTwice }

    private sealed record Attempt(Outcome Outcome, ValidatedScores? Validated, IReadOnlyList<string> Suspected);

    private async Task<Attempt> TryScoreWithRetryAsync(FencedPrompt prompt, CancellationToken ct)
    {
        var first = await CallOnceAsync(prompt, ct);
        if (first.Outcome == CallOutcome.Validated) return new Attempt(Outcome.Validated, first.Validated, first.Suspected);
        if (first.Outcome == CallOutcome.Unavailable) return new Attempt(Outcome.Unavailable, null, []);

        // Schema failure → retry ONCE with a strict-schema reminder.
        var second = await CallOnceAsync(prompt.WithSchemaReminder(), ct);
        return second.Outcome switch
        {
            CallOutcome.Validated => new Attempt(Outcome.Validated, second.Validated, second.Suspected),
            CallOutcome.Unavailable => new Attempt(Outcome.Unavailable, null, []),
            _ => new Attempt(Outcome.SchemaFailedTwice, null, []),
        };
    }

    private enum CallOutcome { Validated, SchemaFail, Unavailable }

    private sealed record CallResult(CallOutcome Outcome, ValidatedScores? Validated, IReadOnlyList<string> Suspected);

    private async Task<CallResult> CallOnceAsync(FencedPrompt prompt, CancellationToken ct)
    {
        try
        {
            var result = await judge.ScoreAsync(prompt, ct);
            return JudgeResultValidator.TryValidate(result, out var v, out _)
                ? new CallResult(CallOutcome.Validated, v, result.SuspectedVetoes)
                : new CallResult(CallOutcome.SchemaFail, null, result.SuspectedVetoes);
        }
        catch (JudgeSchemaException)
        {
            return new CallResult(CallOutcome.SchemaFail, null, []);
        }
        catch (OperationCanceledException)
        {
            // #5: cooperative ct cancellation must propagate, never be laundered into a NEEDS_REVIEW
            // decision. (TimeoutException is not an OperationCanceledException and is handled below.)
            throw;
        }
        catch (Exception ex) when (ex is JudgeUnavailableException or TimeoutException)
        {
            return new CallResult(CallOutcome.Unavailable, null, []);
        }
        catch (Exception)
        {
            // #5: any other unexpected result-shape/runtime exception from the judge (e.g. a null-Criteria
            // NRE from a live judge) is unparseable output — a schema failure that fails closed to
            // NEEDS_REVIEW after the retry, never a default score. Cancellation is already exempted above.
            return new CallResult(CallOutcome.SchemaFail, null, []);
        }
    }
}
