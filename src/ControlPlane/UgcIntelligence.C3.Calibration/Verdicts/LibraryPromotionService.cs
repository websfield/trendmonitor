using UgcIntelligence.C3.Calibration.Breaker;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;

namespace UgcIntelligence.C3.Calibration.Verdicts;

/// <summary>The result of evaluating a shadow: the verdict, and the cohort key the winning library scores under.</summary>
public sealed record PromotionOutcome(LibraryVerdict Verdict, CohortKey ActiveCohort);

/// <summary>
/// P4-T6. Applies a Contract D verdict. On <see cref="LibraryVerdict.Promote"/>, C3 <strong>resets the
/// calibration window</strong>: the promoted library changes <c>pattern_library_version</c>, so the cohort
/// key changes, and the new cohort starts <c>cold</c> until n rebuilds — a rolling correlation computed
/// across a library swap is averaging two different scorers and calling it one number.
///
/// <para>Promotion is C3's authority alone (ADR-0005, authority 2). C1 may cut a candidate at any time but
/// cannot set <c>active_version</c> without this.</para>
/// </summary>
public sealed class LibraryPromotionService(BreakerStore store)
{
    /// <summary>
    /// Enter shadow for a champion/challenger evaluation on a cohort (C2 will score twice while active).
    /// </summary>
    public void BeginShadow(CohortKey incumbentCohort) => store.SetShadow(incumbentCohort, active: true);

    /// <summary>
    /// Apply the paired verdict. On promote, end the incumbent's shadow and reset the challenger's cohort
    /// window (cold until n rebuilds). On reject/extend, the incumbent stays; a rejected candidate simply
    /// stops shadowing.
    /// </summary>
    public PromotionOutcome Apply(PairedCalibration paired, CohortKey incumbentCohort, CohortKey challengerCohort)
    {
        var verdict = ChampionChallengerEvaluator.Evaluate(paired);

        switch (verdict)
        {
            case LibraryVerdict.Promote:
                store.SetShadow(incumbentCohort, active: false);
                store.ResetWindow(challengerCohort);   // new library ⇒ new cohort key ⇒ window resets to cold
                return new PromotionOutcome(verdict, challengerCohort);

            case LibraryVerdict.Reject:
                store.SetShadow(incumbentCohort, active: false);
                return new PromotionOutcome(verdict, incumbentCohort);

            default: // ExtendShadow
                return new PromotionOutcome(LibraryVerdict.ExtendShadow, incumbentCohort);
        }
    }
}
