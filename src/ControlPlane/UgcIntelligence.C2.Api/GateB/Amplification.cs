using UgcIntelligence.Domain;

namespace UgcIntelligence.C2.Api.GateB;

/// <summary>
/// The amplification arm. <strong>It propagates to every downstream <c>PerformanceSnapshot</c></strong>
/// and into the miner in Phase 6. Explore-arm outcomes are the only unconfounded evidence C1 ever
/// receives; an allocator that drops or crosses this tag converts the exploration budget into money
/// spent for nothing.
/// </summary>
public enum Arm
{
    Exploit,
    Explore,
}

/// <summary>How a given allocation's spend was decided. Recorded on <c>AmplificationAllocated</c>.</summary>
public enum SamplingPolicy
{
    /// <summary>Exploit: proportional to (AWS − AWS_floor) across the top-n eligible candidates.</summary>
    ProportionalExploit,

    /// <summary>Explore: Thompson sampling over a Beta posterior on the candidate's outperformance ratio.</summary>
    Thompson,

    /// <summary>Explore: uniform-random sub-pool for insufficient_baseline candidates (no posterior).</summary>
    UniformRandomNoBaseline,
}

/// <summary>
/// One committed allocation of client money to one live post. Money is <see cref="decimal"/>, never a
/// double. <see cref="RngSeed"/> makes a Thompson draw re-derivable from the event log — an allocation
/// that cannot be re-derived is not auditable, and its REQ-039 counterfactual cannot be reconstructed.
/// </summary>
public sealed record Allocation(
    Guid LivePostId,
    Arm Arm,
    decimal Spend,
    decimal Aws,
    string Rationale,
    ExplorationRate Epsilon,
    SamplingPolicy Policy,
    (decimal Low, decimal High) ConfidenceBand,
    long RngSeed);

/// <summary>
/// A ranked, gate-cleared candidate offered to the allocator. <see cref="OutperformanceRatio"/> is null
/// when the creator has fewer than eight trailing posts (<see cref="InsufficientBaseline"/>): such a
/// candidate has no posterior and enters the uniform sub-pool, never an imputed value.
/// </summary>
public sealed record AllocationCandidate(
    Guid LivePostId,
    decimal Aws,
    decimal? OutperformanceRatio,
    bool InsufficientBaseline,
    int PosteriorSuccesses,
    int PosteriorTrials,
    (decimal Low, decimal High) ConfidenceBand);

/// <summary>
/// The result of a budget allocation. The arm budgets are hard caps — <strong>neither arm ever borrows
/// from the other</strong>. An empty tier's budget is <em>unspent and disclosed</em>
/// (<see cref="UnallocatedExploit"/> / <see cref="UnallocatedExplore"/>), never moved across the arm line.
/// </summary>
public sealed record AllocationResult(
    IReadOnlyList<Allocation> Allocations,
    decimal TotalAllocated,
    decimal UnallocatedExploit,
    decimal UnallocatedExplore,
    string SamplerVersion,
    long RngSeed,
    ExplorationRate Epsilon)
{
    public IReadOnlyList<Allocation> Exploit => [.. Allocations.Where(a => a.Arm == Arm.Exploit)];
    public IReadOnlyList<Allocation> Explore => [.. Allocations.Where(a => a.Arm == Arm.Explore)];
}
