namespace UgcIntelligence.Domain.Entities;

/// <summary>A brand campaign under a tenant. Submissions are made against a campaign's brief.</summary>
public sealed record Campaign(
    Guid Id,
    Guid TenantId,
    string Name,
    string Vertical,
    string Platform) : ITenantOwned;
