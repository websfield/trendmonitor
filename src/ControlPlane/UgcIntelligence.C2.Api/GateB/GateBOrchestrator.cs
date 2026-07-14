using UgcIntelligence.Domain;
using UgcIntelligence.Domain.Entities;

namespace UgcIntelligence.C2.Api.GateB;

/// <summary>A candidate excluded by a Gate B hard gate, with the reason surfaced for the client artefact.</summary>
public sealed record ExcludedCandidate(Guid LivePostId, GateBBlock Block, string Reason);

/// <summary>
/// One Gate B candidate: its AWS term inputs, its Beta posterior counts (for the explore draw), the
/// hard-gate inputs (published-post facts, rights grants, performance provenance), and its
/// <strong>precomputed</strong> outperformance ratio.
///
/// <para><see cref="OutperformanceRatio"/> is computed by the producer at the same stage that derives the
/// AWS <c>outperformance_percentile</c> term from the creator baseline — the only stage that holds both the
/// post's 24-hour <c>EngagementRate</c> and the <c>CreatorBaseline</c> — via
/// <see cref="CreatorBaselineService.OutperformanceRatio"/> (median/MAD, never imputed). It is <c>null</c>
/// exactly when the creator has fewer than eight trailing posts (<c>insufficient_baseline</c>) or the
/// denominators differ. It is carried inert to the allocator (Thompson draws from posterior counts) and
/// surfaced for audit on the emitted <see cref="AllocationCandidate"/>.</para>
/// </summary>
public sealed record GateBCandidate(
    AwsInputs Aws,
    int PosteriorSuccesses,
    int PosteriorTrials,
    LivePostFacts Facts,
    IReadOnlyList<RightsGrant> Grants,
    ProvenanceGateResult Provenance,
    decimal? OutperformanceRatio);

/// <summary>
/// The Gate B result: the ranking and allocation over gate-cleared candidates, the excluded set, and the
/// allocation candidates as built (carrying the real, precomputed outperformance ratio for audit).
/// </summary>
public sealed record GateBResultSet(
    RankedAmplification Ranked,
    AllocationResult Allocation,
    IReadOnlyList<ExcludedCandidate> Excluded,
    IReadOnlyList<AllocationCandidate> AllocationCandidates);

/// <summary>
/// P5 orchestration seam. <strong>Hard gates run first, and they exclude a candidate before it can be
/// ranked or receive an allocation.</strong> Only gate-cleared candidates reach
/// <see cref="AmplificationRanker.Rank"/> and <see cref="BudgetAllocator.Allocate"/>; an excluded candidate
/// never appears in <see cref="AllocationResult.Allocations"/>, and its block reason is surfaced on the
/// excluded list.
///
/// <para>The gate is arm-agnostic: <strong>explore is not exempt.</strong> A <c>blocked_rights</c> candidate
/// that would otherwise be an explore/uniform-pool arm is filtered out here, before it can draw a cent from
/// the ε budget. Sign-off re-runs the rights gate as a second, later backstop — the gate runs twice — but
/// this is the primary control, not sign-off.</para>
/// </summary>
public sealed class GateBOrchestrator(BudgetAllocator? allocator = null)
{
    private readonly BudgetAllocator _allocator = allocator ?? new BudgetAllocator();

    public GateBResultSet Run(
        IReadOnlyList<GateBCandidate> candidates,
        decimal total,
        ExplorationRate epsilon,
        long rngSeed,
        decimal spendIncrement,
        int exploitTopN,
        decimal awsFloor,
        DateTimeOffset asOf)
    {
        ArgumentNullException.ThrowIfNull(candidates);

        var cleared = new List<GateBCandidate>();
        var excluded = new List<ExcludedCandidate>();

        foreach (var c in candidates)
        {
            var gate = HardGates.Evaluate(c.Facts, c.Grants, c.Provenance, asOf);
            if (gate.Excluded)
                excluded.Add(new ExcludedCandidate(c.Aws.LivePostId, gate.Block, gate.Reason));
            else
                cleared.Add(c);
        }

        var ranked = AmplificationRanker.Rank(cleared.Select(c => c.Aws));

        // Build allocation candidates from the ranked (gate-cleared) results only.
        var byId = cleared.ToDictionary(c => c.Aws.LivePostId);
        var allocCandidates = ranked.Ranked.Select(r =>
        {
            var src = byId[r.LivePostId];
            return new AllocationCandidate(
                r.LivePostId, r.Aws,
                // insufficient_baseline has no defined ratio; otherwise carry the producer's real,
                // median/MAD-derived value (CreatorBaselineService.OutperformanceRatio) — never a placeholder.
                r.InsufficientBaseline ? null : src.OutperformanceRatio,
                r.InsufficientBaseline,
                src.PosteriorSuccesses, src.PosteriorTrials,
                r.Band);
        }).ToList();

        var allocation = _allocator.Allocate(allocCandidates, total, epsilon, rngSeed, spendIncrement, exploitTopN, awsFloor);

        return new GateBResultSet(ranked, allocation, excluded, allocCandidates);
    }
}
