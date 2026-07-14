namespace UgcIntelligence.Domain.Provenance;

/// <summary>
/// ADR-0001: <em>"the query layer refuses to aggregate across mixed provenance without an
/// explicit, logged override."</em> A Proxy value cannot be silently averaged with a Measured one.
/// </summary>
public static class AggregationGuard
{
    /// <summary>
    /// Throws unless every value shares one provenance, or an override is supplied with a reason.
    /// The override is returned to the caller so it can be logged; it is never silent.
    /// </summary>
    public static IReadOnlyList<Provenanced<decimal>> EnsureHomogeneous(
        IReadOnlyList<Provenanced<decimal>> values,
        MixedProvenanceOverride? approvedOverride = null)
    {
        if (values.Count == 0) return values;

        var distinct = values.Select(v => v.Provenance).Distinct().ToArray();
        if (distinct.Length == 1) return values;

        if (approvedOverride is null)
            throw new MixedProvenanceException(distinct);

        approvedOverride.Log(distinct);
        return values;
    }
}

/// <summary>An override must name a human and a reason. A click with no reason decays into a rubber stamp.</summary>
public sealed record MixedProvenanceOverride(Guid ApprovedBy, string Reason, Action<string> Sink)
{
    public void Log(IReadOnlyList<Provenance> mixed)
    {
        if (string.IsNullOrWhiteSpace(Reason))
            throw new InvalidOperationException("A mixed-provenance override requires a recorded reason.");
        Sink($"MIXED_PROVENANCE_OVERRIDE by={ApprovedBy} reason={Reason} provenances={string.Join(",", mixed)}");
    }
}

public sealed class MixedProvenanceException(IReadOnlyList<Provenance> mixed)
    : InvalidOperationException(
        $"Refusing to aggregate across mixed provenance ({string.Join(", ", mixed)}) without an explicit, " +
        "logged override. Provenance is structural, not documentary (ADR-0001).");
