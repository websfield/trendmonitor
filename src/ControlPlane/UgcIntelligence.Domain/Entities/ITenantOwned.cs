namespace UgcIntelligence.Domain.Entities;

/// <summary>
/// Every stored record belongs to exactly one tenant. Rule 8: tenant data never crosses tenants,
/// and the constraint is structural — a repository that reads these entities filters on
/// <see cref="TenantId"/> on every path, with <strong>no widening override</strong> and no admin
/// escape hatch. An authority overridable from the surface it governs is a comment.
/// </summary>
public interface ITenantOwned
{
    Guid Id { get; }
    Guid TenantId { get; }
}
