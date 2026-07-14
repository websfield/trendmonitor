namespace UgcIntelligence.Domain.Entities;

/// <summary>
/// The brief a submission was made for. Carries the campaign's stored format requirements, which V5
/// (technical spec) is diffed against. <strong>Where the brief specifies no requirement, V5 does not
/// run</strong> — the absence of a rule is not a failed check.
/// </summary>
public sealed record Brief(
    Guid Id,
    Guid TenantId,
    Guid CampaignId,
    TechnicalRequirements? Technical,
    BriefContent? Content = null) : ITenantOwned;

/// <summary>
/// The brief's stored, deterministic adherence requirements, read by the Brief Adherence lane (BAS).
/// Every list is optional; an unset requirement is treated as fully met, because the absence of a rule
/// is not a failed check. <strong>Where a brief explicitly named a format, adherence is checked against
/// this stored text — never a live trend lookup</strong> (ADR-0004), and never a mechanism.
/// </summary>
public sealed record BriefContent(
    IReadOnlyList<string> RequiredTalkingPoints,
    IReadOnlyList<string> MandatoryInclusions,
    IReadOnlyList<string> ProhibitedTerms,
    string? RequiredAspectRatio = null)
{
    public static BriefContent Empty { get; } = new([], [], []);
}

/// <summary>
/// The brief's stored, deterministic format requirements. Every field is optional; an unset field
/// imposes no check. V5 reads these against a <see cref="FeatureRecord"/> only — never against a
/// live trend lookup (ADR-0004).
/// </summary>
public sealed record TechnicalRequirements(
    int? MinDurationSeconds = null,
    int? MaxDurationSeconds = null,
    string? RequiredAspectRatio = null,
    int? MinWidth = null,
    int? MinHeight = null)
{
    /// <summary>True when the brief specifies at least one deterministic technical requirement.</summary>
    public bool HasAnyRequirement =>
        MinDurationSeconds is not null || MaxDurationSeconds is not null ||
        RequiredAspectRatio is not null || MinWidth is not null || MinHeight is not null;
}
