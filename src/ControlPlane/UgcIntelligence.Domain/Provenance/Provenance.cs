namespace UgcIntelligence.Domain.Provenance;

/// <summary>
/// REQ-002. Every metric carries one of these labels together with an as-of date.
/// A <see cref="Proxy"/> value is never displayed or aggregated as if it were
/// <see cref="Measured"/>, in any report, at any layer.
/// </summary>
/// <remarks>
/// ADR-0001 chose <em>structural</em> provenance over <em>documentary</em> provenance:
/// this is a type, not a string column, so a Proxy value entering an effect-size
/// calculation is impossible rather than merely discouraged.
/// </remarks>
public enum Provenance
{
    /// <summary>Read from a first-party analytics surface, or computed from one.</summary>
    Measured,

    /// <summary>Supplied by the client or creator; trusted but unverified.</summary>
    UserProvided,

    /// <summary>Derived, modelled, or projected. Includes every VPS, every AWS, every effect size.</summary>
    Estimated,

    /// <summary>
    /// Read from an adjacent public source standing in for an unavailable measurement.
    /// Every keyless read is Proxy, without exception (ADR-0001, Tier 3).
    /// Corroboration by a second source upgrades a signal's confidence. It never upgrades provenance.
    /// </summary>
    Proxy,
}
