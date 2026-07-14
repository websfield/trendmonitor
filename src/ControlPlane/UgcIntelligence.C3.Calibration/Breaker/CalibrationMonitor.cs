using UgcIntelligence.C3.Calibration.Calibration;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;

namespace UgcIntelligence.C3.Calibration.Breaker;

/// <summary>
/// P4-T4/T5 (C3 side). Turns the calibration statistic into a <see cref="BreakerState"/> — this is C3's
/// authority, the deterministic decision the Python plane never makes. It implements
/// <see cref="IBreakerReader"/> so the same computation serves both C3's own API and, through the C2-side
/// read-through cache, C2's obedient read.
///
/// <para>The rules, all here in one place:
/// <list type="bullet">
/// <item><strong>Automatic to trip.</strong> An armed cohort whose rolling ρ falls below 0.35 (or whose n
/// drops below 60, e.g. after a window reset) is tripped instantly, and the trip revokes the arm — a later
/// recovery does <em>not</em> silently re-arm.</item>
/// <item><strong>Manual to arm.</strong> A cohort is <see cref="BreakerState.Armed"/> only if a human has
/// armed it AND it currently meets ρ ≥ 0.35 on n ≥ 60. An eligible-but-unarmed cohort is <c>cold</c>, with
/// a reason that says so — VPS stays advisory until a person signs off.</item>
/// <item><strong>No guessing.</strong> The reading reports exactly the source's n and ρ. If log lag stalls
/// the held-out count, the cohort stays cold at that n; C3 never extrapolates progress it has not measured.</item>
/// </list></para>
/// </summary>
public sealed class CalibrationMonitor(ICalibrationSource source, BreakerStore store, TimeProvider? clock = null)
    : IBreakerReader
{
    private readonly TimeProvider _clock = clock ?? TimeProvider.System;

    public async Task<BreakerReading> ReadAsync(CohortKey cohort, CancellationToken ct = default)
    {
        var stat = await source.GetAsync(cohort, ct);
        var control = store.Control(cohort);

        var hasN = stat.N >= CalibrationStat.MinHeldOut;
        var rho = hasN ? stat.Rho : null;                         // no rho below the held-out floor
        var eligible = hasN && rho is { } r && r >= CalibrationStat.ArmThreshold;

        // Automatic to trip: an armed cohort that is no longer eligible is tripped, and the trip revokes
        // the arm so a later recovery cannot silently re-arm without a human.
        if (control.ManuallyArmed && !eligible)
        {
            await store.TripAsync(cohort,
                hasN ? $"auto_trip: rho={rho} < {CalibrationStat.ArmThreshold}" : $"auto_trip: n={stat.N} < {CalibrationStat.MinHeldOut}");
            control = store.Control(cohort);
        }

        var asOf = stat.AsOf == default ? _clock.GetUtcNow() : stat.AsOf;

        if (control.ShadowActive)
            return new BreakerReading(BreakerState.Shadow, "champion_challenger_in_progress", stat.N, rho, stat.SuspectedLeak, asOf);

        if (!hasN)
            return new BreakerReading(BreakerState.Cold, $"insufficient_n: n={stat.N} (< {CalibrationStat.MinHeldOut})",
                stat.N, Rho: null, SuspectedLeak: false, asOf);

        if (rho is null)
            return new BreakerReading(BreakerState.Cold, "no_rho_for_cohort", stat.N, null, stat.SuspectedLeak, asOf);

        if (rho < CalibrationStat.ArmThreshold)
            return new BreakerReading(BreakerState.Tripped, $"rho_below_threshold: rho={rho} < {CalibrationStat.ArmThreshold}",
                stat.N, rho, stat.SuspectedLeak, asOf);

        // ρ ≥ 0.35 on n ≥ 60: armed only if a human armed it; otherwise eligible-but-cold.
        return control.ManuallyArmed
            ? new BreakerReading(BreakerState.Armed, $"armed_by={control.ArmedBy}: {control.ArmReason}", stat.N, rho, stat.SuspectedLeak, asOf)
            : new BreakerReading(BreakerState.Cold, $"eligible_awaiting_manual_arm: rho={rho} >= {CalibrationStat.ArmThreshold}",
                stat.N, rho, stat.SuspectedLeak, asOf);
    }
}
