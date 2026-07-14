namespace UgcIntelligence.Domain.Entities;

/// <summary>
/// A creator's stored record. <see cref="VerifiedAgeYears"/> is the <em>only</em> input to V6
/// (minor creator): age is read from the verified record, <strong>never inferred from the video</strong>
/// (compliance-notes §Creators under 18). A null value means the record does not establish age — the
/// record is incomplete, and V6 fails closed to human review rather than to AI scoring.
///
/// <para><see cref="ActiveBrandSafetyFlags"/> are the creator record's active flags read by V3.</para>
/// </summary>
public sealed record Creator(
    Guid Id,
    Guid TenantId,
    string Handle,
    int? VerifiedAgeYears,
    IReadOnlyList<string> ActiveBrandSafetyFlags) : ITenantOwned
{
    public Creator(Guid id, Guid tenantId, string handle, int? verifiedAgeYears)
        : this(id, tenantId, handle, verifiedAgeYears, []) { }
}
