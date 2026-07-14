namespace UgcIntelligence.Domain.Entities;

/// <summary>An agency or brand. The unit of the separation invariant (compliance-notes §separation).</summary>
public sealed record Tenant(Guid Id, string Name) : ITenantOwned
{
    /// <summary>A tenant is its own tenant. Present so the repository contract is uniform.</summary>
    public Guid TenantId => Id;
}
