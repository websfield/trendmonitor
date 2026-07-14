using UgcIntelligence.Domain.Provenance;

namespace UgcIntelligence.C2.Api.GateB;

/// <summary>Whether a candidate can be ranked at all, given the provenance of its performance data.</summary>
public enum Rankability
{
    Rankable,
    Unrankable,
}

/// <summary>The outcome of the provenance gate: rankability and, when unrankable, a surfaced reason.</summary>
public sealed record ProvenanceGateResult(Rankability Rankability, string? Reason)
{
    public bool IsRankable => Rankability == Rankability.Rankable;
}

/// <summary>
/// P5-T2, A9. The provenance hard gate. AWS may be computed only from performance data whose provenance is
/// <see cref="Provenance.Measured"/> or <see cref="Provenance.UserProvided"/>. <strong>Proxy-only data
/// makes a candidate <c>UNRANKABLE</c></strong> — <c>insufficient_evidence</c>, reason surfaced, never
/// ranked. A Proxy value never becomes a measurement, and a candidate is never scored on one.
/// </summary>
public static class ProvenanceGate
{
    public static ProvenanceGateResult Evaluate(IReadOnlyList<Provenance> performanceProvenances)
    {
        ArgumentNullException.ThrowIfNull(performanceProvenances);

        if (performanceProvenances.Count == 0)
            return new ProvenanceGateResult(Rankability.Unrankable,
                "insufficient_evidence: no performance reading. A candidate is never ranked without a measured outcome.");

        var hasMeasurable = performanceProvenances.Any(p => p is Provenance.Measured or Provenance.UserProvided);
        return hasMeasurable
            ? new ProvenanceGateResult(Rankability.Rankable, null)
            : new ProvenanceGateResult(Rankability.Unrankable,
                "insufficient_evidence: performance is proxy-only. A Proxy value never becomes a measurement, so the candidate is UNRANKABLE.");
    }
}
