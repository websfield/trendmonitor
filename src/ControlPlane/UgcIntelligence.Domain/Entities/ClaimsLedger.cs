namespace UgcIntelligence.Domain.Entities;

/// <summary>
/// The campaign's approved claims ledger. V2 (claim integrity) diffs the product claims found in a
/// submission's text against this ledger. A ledger that is <em>absent</em> for a campaign makes V2
/// unevaluable — the submission cannot be approved, and the state is surfaced as
/// <c>unevaluable</c>, never as <c>passed</c>.
/// </summary>
public sealed record ClaimsLedger(
    Guid Id,
    Guid TenantId,
    Guid CampaignId,
    IReadOnlyList<string> ApprovedClaims) : ITenantOwned;
