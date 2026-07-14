namespace UgcIntelligence.C2.Api.Scoring;

/// <summary>
/// One criterion's model output: a 0–100 <see cref="Score"/>, a one-sentence <see cref="Evidence"/>,
/// and a <see cref="Degraded"/> flag (set when the criterion was scored from visual evidence because
/// audio was absent). The score is clamped server-side; the model's raw number is never trusted as-is.
/// </summary>
public sealed record CriterionScore(decimal Score, string Evidence, bool Degraded);

/// <summary>
/// The judge's output. <strong>It has no <c>Vps</c>, no <c>Bas</c>, and no <c>verdict</c> member.</strong>
/// The model returns per-criterion scores and may raise <see cref="SuspectedVetoes"/> for a human;
/// the composite VPS/BAS and the verdict are computed in C# from these numbers. A model that returned a
/// VPS would be deciding — the composition, and the decision, live outside this type by construction
/// (asserted by <c>Judge_CannotReturnVps</c>).
///
/// <para><see cref="SuspectedVetoes"/> is surfaced to a human and <strong>never read by the veto or
/// verdict computation</strong>; no configuration makes it so (Rule 1).</para>
/// </summary>
public sealed record JudgeResult(
    IReadOnlyDictionary<string, CriterionScore> Criteria,
    IReadOnlyList<string> SuspectedVetoes);

/// <summary>The model's raw output failed the strict schema — unparseable, missing a criterion, or empty evidence.</summary>
public sealed class JudgeSchemaException(string message) : Exception(message);

/// <summary>The judge was unreachable or timed out. Nothing in a submission's critical path depends on the model being up.</summary>
public sealed class JudgeUnavailableException(string message) : Exception(message);

/// <summary>
/// P3-T2. The scoring model, behind an abstraction. <strong>The deterministic offline fake
/// (<see cref="OfflineJudge"/>) is the default DI implementation.</strong> A live provider is
/// config-gated and blocked on the APP 8 cross-border decision; Phase 3 ships the abstraction, not the
/// provider — there is no live LLM call of any kind in this plane.
/// </summary>
public interface IJudge
{
    /// <summary>
    /// Score a fenced prompt. May throw <see cref="JudgeSchemaException"/> (bad output — caller retries
    /// once with a reminder) or <see cref="JudgeUnavailableException"/> (down — caller degrades to
    /// NEEDS_REVIEW). It never returns a verdict, a VPS, or a BAS.
    /// </summary>
    Task<JudgeResult> ScoreAsync(FencedPrompt prompt, CancellationToken ct = default);
}
