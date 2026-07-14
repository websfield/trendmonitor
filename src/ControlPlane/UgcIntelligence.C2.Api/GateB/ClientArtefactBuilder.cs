using UgcIntelligence.Contracts;

namespace UgcIntelligence.C2.Api.GateB;

/// <summary>The record that a named human reviewed and signed off this recommendation. Its existence is the gate.</summary>
public sealed record SignoffRecord(Guid EventId, string ReviewerId, DateTimeOffset SignedOffAt, IReadOnlyList<string> Modifications);

/// <summary>One line of the client recommendation. <see cref="Aws"/> is null in numberless mode (REQ-038).</summary>
public sealed record ClientRecommendationItem(Guid LivePostId, int Rank, decimal? Aws, string Provenance, string Rationale);

/// <summary>
/// REQ-039. What "boost the highest raw 24h engagement post" would have picked, versus what the
/// recommendation picks, and how they differ. A permanent internal check on whether the score earns its complexity.
/// </summary>
public sealed record Counterfactual(Guid? NaiveTopPick, Guid? RecommendationTopPick, bool Differs, string Explanation);

/// <summary>The client-facing artefact. It states plainly that it is machine-generated and human-reviewed.</summary>
public sealed record ClientArtefact(
    bool Numberless,
    string? LimitationStatement,
    IReadOnlyList<ClientRecommendationItem> Items,
    IReadOnlyList<ExcludedCandidate> Excluded,
    Counterfactual Counterfactual,
    decimal UnallocatedExploit,
    decimal UnallocatedExplore,
    string ReviewerId,
    DateTimeOffset SignedOffAt)
{
    public bool MachineGeneratedHumanReviewed => true;
}

/// <summary>
/// P5-T8, REQ-037/038/039. Builds the artefact the client receives — <strong>only after a named human
/// signs off</strong> (nothing client-facing before <see cref="SignoffRecord"/> exists).
///
/// <para><strong>Numberless mode (REQ-038).</strong> Where confidence is below threshold the artefact
/// presents a ranking <em>without numeric scores</em> and states the limitation plainly. Low confidence
/// keys off more than the breaker: it fires when the breaker is <c>tripped</c>/<c>cold</c>, <em>or</em>
/// — even with an armed breaker — when any candidate is <c>insufficient_baseline</c> or the top bands
/// overlap. REQ-038 keys off confidence, not breaker state alone.</para>
///
/// <para>Every score is labelled <c>Estimated</c>. Saying so in front of a client is what makes the
/// recommendation defensible, not what undermines it.</para>
/// </summary>
public static class ClientArtefactBuilder
{
    public static ClientArtefact Build(
        RankedAmplification ranked,
        IReadOnlyList<(Guid LivePostId, decimal RawEr24h)> rawEngagement,
        AllocationResult allocation,
        BreakerState breaker,
        SignoffRecord? signoff,
        IReadOnlyList<ExcludedCandidate>? excluded = null)
    {
        ArgumentNullException.ThrowIfNull(ranked);
        ArgumentNullException.ThrowIfNull(allocation);

        // Nothing reaches a client before the sign-off event exists (REQ-037).
        if (signoff is null)
            throw new InvalidOperationException(
                "A client artefact cannot be built without an AmplificationSignedOff. REQ-037: every recommendation "
                + "passes a named human reviewer before it reaches a client.");

        var breakerDegraded = breaker is BreakerState.Tripped or BreakerState.Cold;
        var anyInsufficient = ranked.Ranked.Any(r => r.InsufficientBaseline);
        var numberless = breakerDegraded || ranked.BandsOverlap || anyInsufficient;

        var limitation = numberless ? BuildLimitation(breakerDegraded, ranked.BandsOverlap, anyInsufficient) : null;

        var items = ranked.Ranked.Select((r, i) => new ClientRecommendationItem(
            r.LivePostId,
            Rank: i + 1,
            Aws: numberless ? null : r.Aws,     // numberless: ranking without numeric scores
            Provenance: "Estimated",
            Rationale: numberless
                ? "Ranked by amplification worthiness; numeric score withheld while confidence is below threshold."
                : $"AWS {r.Aws:0.0} (Estimated). Ranked on measured outperformance and cohort percentile.")).ToList();

        var counterfactual = BuildCounterfactual(ranked, rawEngagement);

        return new ClientArtefact(
            numberless, limitation, items, excluded ?? [], counterfactual,
            allocation.UnallocatedExploit, allocation.UnallocatedExplore,
            signoff.ReviewerId, signoff.SignedOffAt);
    }

    private static string BuildLimitation(bool breakerDegraded, bool bandsOverlap, bool anyInsufficient)
    {
        var reasons = new List<string>();
        if (breakerDegraded) reasons.Add("the cohort's calibration breaker is not armed (the score has not demonstrated it rank-orders outcomes here)");
        if (bandsOverlap) reasons.Add("the top candidates' confidence bands overlap, so their order is not statistically distinguishable");
        if (anyInsufficient) reasons.Add("one or more creators have too few trailing posts for a reliable baseline");
        return "This recommendation is presented as a ranking without numeric scores because "
            + string.Join("; ", reasons) + ". A ranking is more credible here than a number.";
    }

    private static Counterfactual BuildCounterfactual(
        RankedAmplification ranked, IReadOnlyList<(Guid LivePostId, decimal RawEr24h)> rawEngagement)
    {
        Guid? naiveTop = rawEngagement.Count == 0
            ? null
            : rawEngagement.OrderByDescending(x => x.RawEr24h).ThenBy(x => x.LivePostId).First().LivePostId;
        Guid? recTop = ranked.Ranked.Count == 0 ? null : ranked.Ranked[0].LivePostId;

        var differs = naiveTop != recTop;
        var explanation = differs
            ? $"The naive baseline ('boost the highest raw 24h engagement post') would boost {naiveTop}. "
              + $"This recommendation instead ranks {recTop} first, because it normalises each post against the creator's own median rather than rewarding follower count."
            : "The naive baseline and this recommendation agree on the top post; the recommendation's value here is in the ordering below rank 1 and in the exploration allocation.";

        return new Counterfactual(naiveTop, recTop, differs, explanation);
    }
}
