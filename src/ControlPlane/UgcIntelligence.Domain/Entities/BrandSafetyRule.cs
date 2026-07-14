namespace UgcIntelligence.Domain.Entities;

/// <summary>
/// A configured brand-safety rule: a term whose presence in a submission's text triggers V3. V3 is
/// absolute by design — it has no carve-out — and reads configured rules plus the creator record's
/// active flags. The absence of any configured rule is not a failed check.
/// </summary>
public sealed record BrandSafetyRule(
    Guid Id,
    Guid TenantId,
    string Term) : ITenantOwned;
