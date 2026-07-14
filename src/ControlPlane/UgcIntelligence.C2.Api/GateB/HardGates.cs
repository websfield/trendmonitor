using UgcIntelligence.Domain.Entities;

namespace UgcIntelligence.C2.Api.GateB;

/// <summary>
/// The Gate B exclusion reasons. <see cref="None"/> means the candidate cleared every hard gate. Every
/// other value <strong>excludes the candidate entirely</strong> — a hard-gate failure never reduces a
/// score, it removes the candidate from the recommendation, with the reason surfaced.
/// </summary>
public enum GateBBlock
{
    None,
    BlockedRights,
    BlockedDisclosure,
    BlockedBrandSafety,
    Unrankable,
}

/// <summary>The gate result: the block reason (or none) and a surfaced explanation.</summary>
public sealed record GateBResult(GateBBlock Block, string Reason)
{
    public bool Excluded => Block != GateBBlock.None;
    public static GateBResult Clear { get; } = new(GateBBlock.None, "cleared all Gate B hard gates");
}

/// <summary>
/// The live post's re-checked compliance facts at Gate B. <see cref="LiveDisclosure"/> is a
/// provenance-bearing <see cref="LiveDisclosureResult"/> that can only be produced by the deterministic
/// detector over the published artefact (REQ-034) — it cannot be set from a caption's own claim.
/// </summary>
public sealed record LivePostFacts(
    Guid LivePostId,
    Guid CreatorId,
    LiveDisclosureResult LiveDisclosure,
    IReadOnlyList<string> CreatorActiveBrandSafetyFlags);

/// <summary>
/// P5-T4, REQ-033/034. The Gate B hard gates — a re-check of V4 (rights, now <c>paid_amplification</c>),
/// V1 (disclosure, on the live post), and V3 (brand safety), plus the provenance gate. <strong>A failure
/// excludes; it never reduces.</strong> The gates apply identically to the exploit and explore arms —
/// <strong>explore does not mean exempt.</strong> Exploration relaxes the score, never the rules.
/// </summary>
public static class HardGates
{
    /// <summary>
    /// Evaluate all Gate B hard gates in order. Returns the first exclusion, or <see cref="GateBResult.Clear"/>.
    /// Gate A's <c>organic_publish</c> grant never satisfies the paid gate; only an unexpired
    /// <c>paid_amplification</c> grant with evidence does.
    /// </summary>
    public static GateBResult Evaluate(
        LivePostFacts facts,
        IReadOnlyList<RightsGrant> grants,
        ProvenanceGateResult provenance,
        DateTimeOffset asOf)
    {
        ArgumentNullException.ThrowIfNull(facts);
        ArgumentNullException.ThrowIfNull(grants);
        ArgumentNullException.ThrowIfNull(provenance);

        // V4 at Gate B: an unexpired paid_amplification grant WITH evidence. Organic consent, public
        // posting, tagging, and branded-hashtag use never satisfy this.
        var hasPaid = grants.Any(g => g.IsEffective(RightsGrantType.PaidAmplification, asOf));
        if (!hasPaid)
        {
            var organicOnly = grants.Any(g => g.IsEffective(RightsGrantType.OrganicPublish, asOf));
            var why = organicOnly
                ? "blocked_rights: only an organic_publish grant is on record. Organic consent never covers paid use — obtain a paid_amplification grant."
                : "blocked_rights: no unexpired paid_amplification grant with evidence. The specific missing grant is paid_amplification.";
            return new GateBResult(GateBBlock.BlockedRights, why);
        }

        // V1 at Gate B: disclosure re-verified on the published post (REQ-034). The verdict comes from the
        // deterministic detector (LiveDisclosureResult), never from a caption's own claim.
        if (!facts.LiveDisclosure.Verified)
            return new GateBResult(GateBBlock.BlockedDisclosure,
                $"blocked_disclosure: disclosure is not verified present on the live post (REQ-034). {facts.LiveDisclosure.Evidence}");

        // V3 at Gate B: no active brand-safety flag on the creator.
        if (facts.CreatorActiveBrandSafetyFlags.Count > 0)
            return new GateBResult(GateBBlock.BlockedBrandSafety,
                $"blocked_brand_safety: creator carries active flag(s): {string.Join(", ", facts.CreatorActiveBrandSafetyFlags)}.");

        // Provenance gate: proxy-only ⇒ unrankable.
        if (!provenance.IsRankable)
            return new GateBResult(GateBBlock.Unrankable, provenance.Reason!);

        return GateBResult.Clear;
    }
}
