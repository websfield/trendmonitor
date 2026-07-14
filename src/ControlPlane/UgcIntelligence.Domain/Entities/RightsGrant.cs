namespace UgcIntelligence.Domain.Entities;

/// <summary>
/// The rights types, encoded as types rather than a boolean (compliance-notes §Usage rights).
/// <strong><see cref="OrganicPublish"/> never implies <see cref="PaidAmplification"/></strong>: there
/// is no inference path from one to the other and no configuration that enables it.
/// </summary>
public enum RightsGrantType
{
    OrganicPublish,
    PaidAmplification,
    WebsiteReuse,
    EmailReuse,
    Perpetuity,
}

/// <summary>
/// A recorded permission entry. V4 (rights record) reads this table and nothing else: public posting,
/// tagging, and branded-hashtag use are never a grant, and a caption asserting a grant is irrelevant.
///
/// <para><strong>A grant without <see cref="EvidenceUri"/> is not a grant</strong>
/// (compliance-notes §Usage rights) — <see cref="EvidenceUri"/> must point at an actual signed
/// instrument. Gate A requires an unexpired <see cref="RightsGrantType.OrganicPublish"/>.</para>
/// </summary>
public sealed record RightsGrant(
    Guid Id,
    Guid TenantId,
    Guid SubmissionId,
    Guid CreatorId,
    RightsGrantType GrantType,
    string? EvidenceUri,
    DateTimeOffset? ExpiresAt) : ITenantOwned
{
    /// <summary>
    /// A grant counts only if it names a grant type, carries evidence, and has not expired as of
    /// <paramref name="asOf"/>. Every clause fails closed: no evidence, expired, or wrong type ⇒ not a grant.
    /// </summary>
    public bool IsEffective(RightsGrantType required, DateTimeOffset asOf) =>
        GrantType == required
        && !string.IsNullOrWhiteSpace(EvidenceUri)
        && (ExpiresAt is null || ExpiresAt.Value > asOf);
}
