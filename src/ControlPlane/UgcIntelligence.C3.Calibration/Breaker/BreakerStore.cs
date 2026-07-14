using System.Collections.Concurrent;
using UgcIntelligence.Domain;

namespace UgcIntelligence.C3.Calibration.Breaker;

/// <summary>
/// The manual-control state a human recorded for a cohort. The calibration statistic (n, ρ) is computed
/// fresh each read; this record is the part a person owns: whether the cohort has been armed, by whom and
/// why, and whether a champion/challenger shadow is in progress.
/// </summary>
public sealed record BreakerControl(
    bool ManuallyArmed,
    Guid? ArmedBy,
    string? ArmReason,
    DateTimeOffset? ArmedAt,
    bool ShadowActive,
    string? LastTripReason)
{
    public static BreakerControl Initial { get; } = new(false, null, null, null, false, null);
}

/// <summary>
/// P4-T4. The breaker store — C3's sole write surface for the flag. In-memory, cohort-keyed, matching the
/// Phase 0/1/3 store convention. Every mutation validates before it writes, so a rejected write
/// (e.g. an arm with no reason) leaves the prior state exactly as it was — never a partial state.
/// </summary>
public sealed class BreakerStore : IBreakerAuthority
{
    private readonly ConcurrentDictionary<string, BreakerControl> _byCohort = new(StringComparer.Ordinal);

    private static string Key(CohortKey c) => c.ToString();

    /// <summary>The recorded control for a cohort, or the initial (never-armed, no-shadow) state.</summary>
    public BreakerControl Control(CohortKey cohort) =>
        _byCohort.TryGetValue(Key(cohort), out var c) ? c : BreakerControl.Initial;

    /// <summary>Trip a cohort automatically. Clears any manual arm — recovery does not re-arm; a human must.</summary>
    public Task TripAsync(CohortKey cohort, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
            throw new ArgumentException("A trip records a reason.", nameof(reason));

        _byCohort.AddOrUpdate(
            Key(cohort),
            _ => BreakerControl.Initial with { LastTripReason = reason },
            (_, existing) => existing with
            {
                ManuallyArmed = false,   // automatic trip revokes the arm
                ArmedBy = null,
                ArmReason = null,
                ArmedAt = null,
                LastTripReason = reason,
            });
        return Task.CompletedTask;
    }

    /// <summary>
    /// Arm a cohort. Manual only. <strong>Validated before any write</strong>: a missing human id or an
    /// empty reason throws and the store is untouched. This is the manual-arm interlock.
    /// </summary>
    public Task ArmAsync(CohortKey cohort, Guid humanId, string recordedReason)
    {
        if (humanId == Guid.Empty)
            throw new ArgumentException("Arming requires a real human id.", nameof(humanId));
        if (string.IsNullOrWhiteSpace(recordedReason))
            throw new ArgumentException(
                "Arming requires a recorded reason. An arm with no reason is rejected — the reason is the interlock.",
                nameof(recordedReason));

        _byCohort.AddOrUpdate(
            Key(cohort),
            _ => BreakerControl.Initial with { ManuallyArmed = true, ArmedBy = humanId, ArmReason = recordedReason, ArmedAt = DateTimeOffset.UtcNow },
            (_, existing) => existing with { ManuallyArmed = true, ArmedBy = humanId, ArmReason = recordedReason, ArmedAt = DateTimeOffset.UtcNow });
        return Task.CompletedTask;
    }

    /// <summary>Enter champion/challenger shadow for a cohort (C3 authority; not a public arm/trip).</summary>
    public void SetShadow(CohortKey cohort, bool active) =>
        _byCohort.AddOrUpdate(
            Key(cohort),
            _ => BreakerControl.Initial with { ShadowActive = active },
            (_, existing) => existing with { ShadowActive = active });

    /// <summary>
    /// Reset a cohort's window (on library promotion). The manual arm is cleared and shadow ends: the new
    /// library's cohort starts cold until n rebuilds. Idempotent.
    /// </summary>
    public void ResetWindow(CohortKey cohort) =>
        _byCohort[Key(cohort)] = BreakerControl.Initial with { LastTripReason = "window_reset_on_promotion" };
}
