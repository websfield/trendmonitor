using UgcIntelligence.C3.Calibration.Calibration;
using UgcIntelligence.Contracts;

namespace UgcIntelligence.C3.Calibration.Verdicts;

/// <summary>
/// A paired champion/challenger calibration result: the incumbent and the candidate library, each scored
/// on <strong>the same held-out submissions</strong> (<see cref="N"/> of them). The paired comparison is
/// what controls for the quarter being easy or hard — an unpaired comparison across time does not.
/// </summary>
public sealed record PairedCalibration(int N, decimal? IncumbentRho, decimal? ChallengerRho);

/// <summary>
/// P4-T6. Contract D. C3's second authority: the verdict on whether a candidate library may be promoted.
/// The challenger must beat the incumbent on the same held-out submissions by a clear margin, on a
/// sufficient sample. <see cref="LibraryVerdict.ExtendShadow"/> is the common outcome and costs only the
/// doubled model spend — most mining runs surface refinements, not discoveries.
/// </summary>
public static class ChampionChallengerEvaluator
{
    /// <summary>The margin by which a challenger must beat the incumbent's rolling ρ to be promoted.</summary>
    public const decimal PromoteMargin = 0.03m;

    /// <summary>The margin by which a challenger must trail to be rejected outright.</summary>
    public const decimal RejectMargin = 0.03m;

    public static LibraryVerdict Evaluate(PairedCalibration paired)
    {
        ArgumentNullException.ThrowIfNull(paired);

        // Not enough paired evidence yet: keep shadowing. Never promote on a thin sample.
        if (paired.N < CalibrationStat.MinHeldOut
            || paired.IncumbentRho is not { } incumbent
            || paired.ChallengerRho is not { } challenger)
            return LibraryVerdict.ExtendShadow;

        if (challenger >= incumbent + PromoteMargin) return LibraryVerdict.Promote;
        if (challenger <= incumbent - RejectMargin) return LibraryVerdict.Reject;
        return LibraryVerdict.ExtendShadow;
    }
}
