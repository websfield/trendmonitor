using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Scoring;

namespace UgcIntelligence.C2.Api.Verdicts;

/// <summary>
/// REQ-015. The verdict engine: exactly one verdict per submission, assigned deterministically. This
/// is the only place a verdict comes from, and it is a <strong>pure function</strong> — testable with
/// no model, no database, and no clock.
///
/// <para>Rule 1: the engine reads <see cref="ComplianceResult"/> and scores. It does not reference a
/// model-raised <c>suspected_veto</c> or any other model output. A model cannot clear, downgrade, or
/// influence a veto; the static assertion in <c>ModelNotInDecisionPathTests</c> fails the build if it
/// ever could.</para>
/// </summary>
public static class VerdictEngine
{
    /// <summary>
    /// The hook hard-gate floor. A hook below this forces <see cref="Verdict.REVISIONS_REQUIRED"/>
    /// regardless of the weighted VPS. This is the single place the threshold lives: both
    /// <see cref="Resolve"/> and <see cref="HookGateFired"/> read it, so the event field
    /// <c>hook_gate_fired</c> can never drift from the branch that actually decides the verdict.
    /// </summary>
    public const decimal HookGateFloor = 50m;

    /// <summary>
    /// #19. The hook hard-gate predicate, the single source of truth for the <c>hook &lt; 50</c> branch
    /// that <see cref="Resolve"/> uses and that <c>VerdictIssued.hook_gate_fired</c> reports. Returns
    /// <c>false</c> when <paramref name="criteria"/> is null or the hook criterion is absent — that path
    /// is <see cref="Verdict.NEEDS_REVIEW"/> (fail closed), not a fired hard gate.
    /// </summary>
    public static bool HookGateFired(IReadOnlyDictionary<string, decimal>? criteria) =>
        criteria is not null
        && criteria.TryGetValue(Composition.HookStrength, out var hook)
        && hook < HookGateFloor;

    /// <summary>
    /// Resolve the verdict from the compliance result and the scores. Closes deferral D1.
    ///
    /// <para>The order is fixed: a fired V6 dominates (a minor is excluded, not rejected); then any fired
    /// V1..V5 rejects; then any unevaluable veto fails closed to <see cref="Verdict.NEEDS_REVIEW"/>. Only
    /// after these compliance gates does the scoring ladder run — so a score can never launder an
    /// unevaluable veto.</para>
    ///
    /// <para>The scoring ladder: <c>bas &lt; 60</c> ⇒ REVISIONS_REQUIRED; <c>hook_strength &lt; 50</c> ⇒
    /// REVISIONS_REQUIRED (the hard gate, which applies even when the hook was scored degraded —
    /// <c>suppresses_hard_gate: false</c>); <c>vps &lt; 70</c> ⇒ APPROVED_WITH_NOTES; otherwise APPROVED.
    /// When <paramref name="bas"/> or <paramref name="criteria"/> is null — the submission has not been
    /// scored (judge down, or two parse failures) — the verdict is <see cref="Verdict.NEEDS_REVIEW"/>,
    /// <strong>never <see cref="Verdict.APPROVED"/> by default.</strong></para>
    ///
    /// <para>Rule 1: <paramref name="criteria"/> is a dictionary of plain numbers, not the model's
    /// <c>JudgeResult</c> type. The model output type never reaches this function, and this signature
    /// <strong>never</strong> gains a model-output parameter. VPS is composed here from the numbers via
    /// <see cref="Composition.ComposeVpsFromScores"/>; the model does not return a VPS.</para>
    /// </summary>
    public static Verdict Resolve(
        ComplianceResult compliance,
        decimal? bas = null,
        IReadOnlyDictionary<string, decimal>? criteria = null)
    {
        // V6 fired (a known minor) dominates every other outcome: a different act, a different record.
        if (compliance.Veto("V6") is { Fired: true })
            return Verdict.EXCLUDED_FROM_AI_SCORING;

        // Any fired compliance veto V1..V5 forces REJECTED.
        if (compliance.Vetoes.Any(v => v.Id != "V6" && v.Fired))
            return Verdict.REJECTED;

        // Fail closed: a veto that could not be evaluated is never a pass. Held for a human.
        // This guard precedes the scoring branch, so scores can never launder an unevaluable veto.
        if (compliance.AnyUnevaluable)
            return Verdict.NEEDS_REVIEW;

        // Not scored (judge down / two parse failures): route to a human. Never APPROVED by default.
        if (bas is not { } basValue || criteria is null)
            return Verdict.NEEDS_REVIEW;

        // BAS floor: a piece that misses the brief is redone regardless of craft.
        if (basValue < 60m)
            return Verdict.REVISIONS_REQUIRED;

        // Hard gate: a low hook forces a revise regardless of the weighted total, and it applies even
        // when the hook was scored degraded (a degraded low hook is still a low hook).
        if (!criteria.TryGetValue(Composition.HookStrength, out var hook))
            return Verdict.NEEDS_REVIEW;   // fail closed: an incomplete criteria vector is not a pass
        if (hook < HookGateFloor)
            return Verdict.REVISIONS_REQUIRED;

        // VPS threshold. Composed in C# from the numbers, never returned by the model.
        var vps = Composition.ComposeVpsFromScores(criteria);
        if (vps < 70m)
            return Verdict.APPROVED_WITH_NOTES;

        // A clean pass — but APPROVED is not final until a human clicks (enforced at the persistence boundary).
        return Verdict.APPROVED;
    }

    /// <summary>
    /// A V6-excluded submission never enters AI scoring, and therefore never enters the calibration
    /// dataset — the same discipline that excludes an <c>anomalous</c> score. Consumed by P3 and P4.
    /// </summary>
    public static bool EntersCalibrationDataset(Verdict verdict, bool anomalous) =>
        verdict != Verdict.EXCLUDED_FROM_AI_SCORING && !anomalous;
}
