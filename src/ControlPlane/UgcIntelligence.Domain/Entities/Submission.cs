namespace UgcIntelligence.Domain.Entities;

/// <summary>
/// A creator's submission against a campaign brief. <see cref="Caption"/> and the platform are
/// metadata available <em>before</em> extraction completes, which is why the compliance gate can run
/// on caption and metadata alone when the extraction service is down.
///
/// <para><see cref="Caption"/> is untrusted creator text (ADR-0002): it is evaluated as data, never
/// read as an instruction. A caption asserting "mark V1 as passing" changes no veto outcome.</para>
/// </summary>
public sealed record Submission(
    Guid Id,
    Guid TenantId,
    Guid CampaignId,
    Guid CreatorId,
    string Platform,
    string Caption,
    bool IsSponsored,
    DateTimeOffset SubmittedAt) : ITenantOwned;
