using System.Reflection;
using UgcIntelligence.C2.Api.GateB;
using UgcIntelligence.Domain.Entities;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>A4, REQ-033/034. Gate B hard gates exclude (never reduce), and the explore arm is not exempt.</summary>
public sealed class HardGateTests
{
    private static readonly Guid LivePost = Phase5Fixtures.Post(1);
    private static readonly Guid Submission = Guid.NewGuid();

    private static GateBResult Evaluate(IReadOnlyList<RightsGrant> grants, bool disclosure = true, string[]? flags = null) =>
        HardGates.Evaluate(Phase5Fixtures.Facts(LivePost, disclosure, flags ?? []), grants, Phase5Fixtures.MeasuredProvenance(), Phase5Fixtures.T0);

    [Fact]
    public void Clear_WhenAllGatesPass() =>
        Assert.False(Evaluate([Phase5Fixtures.PaidGrant(Submission)]).Excluded);

    /// <summary>Ranker_BlockedRights_ExcludedAndNamed. No paid grant ⇒ excluded, and the missing grant is named.</summary>
    [Fact]
    public void Ranker_BlockedRights_ExcludedAndNamed()
    {
        var result = Evaluate([]);   // no grant at all
        Assert.Equal(GateBBlock.BlockedRights, result.Block);
        Assert.Contains("paid_amplification", result.Reason);
    }

    /// <summary>An organic_publish grant never satisfies the paid gate (REQ-033).</summary>
    [Fact]
    public void OrganicGrant_DoesNotSatisfyPaidGate()
    {
        var result = Evaluate([Phase5Fixtures.OrganicGrant(Submission)]);
        Assert.Equal(GateBBlock.BlockedRights, result.Block);
        Assert.Contains("Organic consent never covers paid use", result.Reason);
    }

    /// <summary>A paid grant with no evidence is not a grant.</summary>
    [Fact]
    public void PaidGrantWithoutEvidence_IsBlocked() =>
        Assert.Equal(GateBBlock.BlockedRights, Evaluate([Phase5Fixtures.PaidGrant(Submission, withEvidence: false)]).Block);

    /// <summary>An expired paid grant is blocked.</summary>
    [Fact]
    public void ExpiredPaidGrant_IsBlocked() =>
        Assert.Equal(GateBBlock.BlockedRights, Evaluate([Phase5Fixtures.PaidGrant(Submission, expired: true)]).Block);

    /// <summary>REQ-034. Disclosure re-checked on the live post: not verified ⇒ blocked.</summary>
    [Fact]
    public void LiveDisclosureNotVerified_IsBlocked() =>
        Assert.Equal(GateBBlock.BlockedDisclosure, Evaluate([Phase5Fixtures.PaidGrant(Submission)], disclosure: false).Block);

    /// <summary>
    /// REQ-034 / untrusted input as a regulatory control. A caption that asserts its own disclosure, while
    /// the published artefact carries none, is blocked_disclosure — the caption's claim is ignored, because
    /// the verdict comes from the deterministic detector over the published features, not from creator text.
    /// </summary>
    [Fact]
    public void LiveDisclosure_CaptionClaimIgnored_WhenPublishedArtefactHasNone()
    {
        var facts = Phase5Fixtures.FactsWithCaptionClaimButNoRealDisclosure(LivePost);
        var result = HardGates.Evaluate(facts, [Phase5Fixtures.PaidGrant(Submission)], Phase5Fixtures.MeasuredProvenance(), Phase5Fixtures.T0);

        Assert.False(facts.LiveDisclosure.Verified);              // the checker did not verify the caption's claim
        Assert.Equal(GateBBlock.BlockedDisclosure, result.Block);
    }

    /// <summary>
    /// The disclosure fact is structurally un-settable from untrusted text: <see cref="LiveDisclosureResult"/>
    /// has no public constructor, so no caller can hand-build a "verified" value — only the checker produces it.
    /// </summary>
    [Fact]
    public void LiveDisclosureResult_HasNoPublicConstructor() =>
        Assert.Empty(typeof(LiveDisclosureResult).GetConstructors(BindingFlags.Public | BindingFlags.Instance));

    [Fact]
    public void ActiveBrandSafetyFlag_IsBlocked() =>
        Assert.Equal(GateBBlock.BlockedBrandSafety, Evaluate([Phase5Fixtures.PaidGrant(Submission)], flags: ["suspended"]).Block);

    /// <summary>
    /// A4. The explore arm is not exempt: the hard gate takes no arm parameter, so it applies identically to
    /// exploit and explore. A gate failure EXCLUDES (returns a block), it does not reduce a score.
    /// </summary>
    [Fact]
    public void ExploreArmNotExempt()
    {
        // Structural: HardGates.Evaluate has no Arm parameter — it cannot treat explore differently.
        var evaluate = typeof(HardGates).GetMethod(nameof(HardGates.Evaluate), BindingFlags.Public | BindingFlags.Static)!;
        Assert.DoesNotContain(evaluate.GetParameters(), p => p.ParameterType == typeof(Arm));

        // Behavioural: a blocked candidate is excluded (a block reason), never a reduced-but-present score.
        var result = Evaluate([]);
        Assert.True(result.Excluded);
        Assert.NotEqual(GateBBlock.None, result.Block);
    }
}
