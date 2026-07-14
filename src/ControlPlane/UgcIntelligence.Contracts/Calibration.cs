using UgcIntelligence.Domain;

namespace UgcIntelligence.Contracts;

/// <summary>
/// Contract C. The breaker state per cohort key. <strong>C3 writes these; C2 reads them and obeys.</strong>
/// There is no configuration in C2 that overrides a breaker — a breaker switchable from the component it
/// governs is a comment. This type lives in the shared contracts assembly precisely so C2 can read it
/// without a reference to C3: C2 depends on the contract, never on the referee.
/// </summary>
public enum BreakerState
{
    /// <summary>Rolling Spearman ρ ≥ 0.35 on n ≥ 60 held out, and a human has armed it. VPS surfaced with a band.</summary>
    Armed,

    /// <summary>Rolling ρ fell below threshold on n ≥ 60. VPS computed and stored, not surfaced. Automatic.</summary>
    Tripped,

    /// <summary>n &lt; 60, no library, a compatibility mismatch, an eligible-but-unarmed cohort — or the fail-closed default.</summary>
    Cold,

    /// <summary>Champion/challenger evaluation in progress: C2 scores twice, champion surfaces, both stored.</summary>
    Shadow,
}

/// <summary>
/// Contract C, the read shape C2 obeys. <see cref="Rho"/> is <c>null</c> whenever <see cref="N"/> &lt; 60:
/// there is no rho for a cohort that has not accumulated enough held-out outcomes, and no overload returns
/// one. <see cref="Reason"/> is always surfaced — a <c>cold</c> from insufficient n reads differently from a
/// <c>cold</c> from an unreachable referee, and the difference matters to the manager looking at it.
/// </summary>
public sealed record BreakerReading(
    BreakerState State,
    string Reason,
    int N,
    decimal? Rho,
    bool SuspectedLeak,
    DateTimeOffset AsOf)
{
    /// <summary>The state as the lowercase token the event stream records (<c>breaker_state_at_score</c>).</summary>
    public string StateToken => State.ToString().ToLowerInvariant();

    /// <summary>The fail-closed reading. n is 0 and rho is null: an unreachable referee is never permission.</summary>
    public static BreakerReading ColdReading(string reason, DateTimeOffset asOf) =>
        new(BreakerState.Cold, reason, N: 0, Rho: null, SuspectedLeak: false, asOf);
}

/// <summary>
/// The <em>only</em> interface C2 receives for the breaker (Contract C). It reads; it cannot write. The
/// write authority (<c>IBreakerAuthority</c>) lives in C3's assembly and is unreachable from C2, which is
/// what makes "C2 has no write path to breaker state" a reachability fact rather than a rule.
/// </summary>
public interface IBreakerReader
{
    Task<BreakerReading> ReadAsync(CohortKey cohort, CancellationToken ct = default);
}

/// <summary>
/// Contract D. C1 requests a shadow evaluation; C3 issues one of these. C1 cannot promote a candidate
/// library without it. <see cref="ExtendShadow"/> is the common outcome and costs only doubled model spend.
/// On <see cref="Promote"/>, C3 resets the calibration window and the breaker drops to <see cref="BreakerState.Cold"/>
/// until n rebuilds under the new library's cohort key.
/// </summary>
public enum LibraryVerdict
{
    Promote,
    Reject,
    ExtendShadow,
}
