using UgcIntelligence.Domain;

namespace UgcIntelligence.C3.Calibration.Breaker;

/// <summary>
/// C3's sole write authority over the breaker (ADR-0005, authority 1). It lives in C3's assembly and is
/// <strong>unreachable from C2</strong> — C2 references only <c>IBreakerReader</c> in the shared contracts
/// assembly. Neither C1 nor C2 can set, clear, or override the flag; an authority overridable from the
/// component it governs is a comment.
///
/// <para>The asymmetry is deliberate: <strong>automatic to trip, manual to arm.</strong> C3 trips a cohort
/// instantly on the rolling computation, with no human involvement. Arming — moving a cohort to where its
/// VPS is surfaced to clients — requires a human to look at why and record a reason.</para>
/// </summary>
public interface IBreakerAuthority
{
    /// <summary>Trip a cohort. Automatic, no human required. Records the reason. Idempotent.</summary>
    Task TripAsync(CohortKey cohort, string reason);

    /// <summary>
    /// Arm a cohort. Manual only: requires a real human id and a non-empty recorded reason. An arm with no
    /// reason is rejected — the recorded reason is the whole point of the interlock.
    /// </summary>
    Task ArmAsync(CohortKey cohort, Guid humanId, string recordedReason);
}
