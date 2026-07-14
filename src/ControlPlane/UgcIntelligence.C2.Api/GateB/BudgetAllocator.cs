using UgcIntelligence.Domain;

namespace UgcIntelligence.C2.Api.GateB;

/// <summary>
/// P5-T6, REQ-035/036, ADR-0003. Splits a stated budget across the exploit and explore arms, summing
/// exactly and never letting one arm borrow from the other. Money is <see cref="decimal"/>.
///
/// <list type="bullet">
/// <item><strong>Exploit</strong> — proportional to (AWS − AWS_floor) across the top-n eligible candidates.</item>
/// <item><strong>Explore</strong> — Thompson sampling over a Beta posterior on each candidate's
/// outperformance ratio (a <strong>seeded</strong> draw), concentrating spend where rank is genuinely
/// uncertain. Candidates with <c>insufficient_baseline</c> have no posterior and enter a uniform sub-pool
/// receiving <see cref="UniformSubpoolShare"/> of the explore budget.</item>
/// <item><strong>Every allocation carries an arm</strong>, and exploit money never wears an <c>explore</c>
/// tag or vice versa. An empty tier's budget is unspent and disclosed — never moved across the arm line,
/// because tagging exploit money as explore poisons the arm-conditioned mining in Phase 6.</item>
/// </list>
///
/// <para>ε comes from an <see cref="ExplorationRate"/> value object with no path to zero. Hard gates are
/// applied by <see cref="GateBOrchestrator"/> <strong>before</strong> candidates reach the ranker or this
/// allocator, so every candidate here is already gate-cleared; explore is not exempt (a blocked candidate
/// was filtered out before it could draw from the ε budget).</para>
/// </summary>
public sealed class BudgetAllocator(BetaSampler? sampler = null)
{
    /// <summary>A16. The share of the explore budget reserved for the uniform (no-baseline) sub-pool.</summary>
    public const decimal UniformSubpoolShare = 0.25m;

    public string SamplerVersion => BetaSampler.Version;

    public AllocationResult Allocate(
        IReadOnlyList<AllocationCandidate> candidates,
        decimal total,
        ExplorationRate epsilon,
        long rngSeed,
        decimal spendIncrement,
        int exploitTopN,
        decimal awsFloor = 0m)
    {
        ArgumentNullException.ThrowIfNull(candidates);
        if (total < 0m) throw new ArgumentOutOfRangeException(nameof(total));
        if (spendIncrement <= 0m) throw new ArgumentOutOfRangeException(nameof(spendIncrement));

        var betaSampler = sampler ?? new BetaSampler(new Random(unchecked((int)rngSeed)));

        // Exact split: exploit + explore == total, because (1 − ε) + ε == 1 exactly in decimal.
        var exploitBudget = total * epsilon.ExploitShare;
        var exploreBudget = total - exploitBudget;

        // Deterministic partition (stable order ⇒ reproducible draws).
        var baseline = candidates.Where(c => !c.InsufficientBaseline)
            .OrderByDescending(c => c.Aws).ThenBy(c => c.LivePostId).ToList();
        var noBaseline = candidates.Where(c => c.InsufficientBaseline)
            .OrderBy(c => c.LivePostId).ToList();

        var exploitTier = baseline.Where(c => c.Aws > awsFloor).Take(exploitTopN).ToList();
        var exploitIds = exploitTier.Select(c => c.LivePostId).ToHashSet();
        var thompsonPool = baseline.Where(c => !exploitIds.Contains(c.LivePostId)).ToList();
        var uniformPool = noBaseline;

        var allocations = new List<Allocation>();
        decimal unallocatedExploit = 0m, unallocatedExplore = 0m;

        // ---- Exploit arm --------------------------------------------------------------------------
        if (exploitTier.Count == 0)
        {
            unallocatedExploit = exploitBudget;   // unspent and disclosed — NEVER moved to explore
        }
        else
        {
            var weights = exploitTier.Select(c => Math.Max(0m, c.Aws - awsFloor)).ToList();
            var spends = AllocateProportional(exploitBudget, weights, spendIncrement, topIndex: 0);
            for (var i = 0; i < exploitTier.Count; i++)
                allocations.Add(MakeAllocation(exploitTier[i], Arm.Exploit, SamplingPolicy.ProportionalExploit,
                    spends[i], epsilon, rngSeed,
                    $"exploit: AWS {exploitTier[i].Aws:0.0} above floor {awsFloor:0.0}, proportional share."));
        }

        // ---- Explore arm --------------------------------------------------------------------------
        var hasThompson = thompsonPool.Count > 0;
        var hasUniform = uniformPool.Count > 0;

        if (!hasThompson && !hasUniform)
        {
            unallocatedExplore = exploreBudget;   // ε unspent and disclosed — ε is NEVER zeroed by an empty tier
        }
        else
        {
            var uniformBudget = hasUniform ? (hasThompson ? UniformSubpoolShare * exploreBudget : exploreBudget) : 0m;
            var thompsonBudget = exploreBudget - uniformBudget;

            if (hasThompson)
            {
                var draws = thompsonPool
                    .Select(c => (decimal)betaSampler.Sample(1.0 + c.PosteriorSuccesses, 1.0 + Math.Max(0, c.PosteriorTrials - c.PosteriorSuccesses)))
                    .ToList();
                var topIndex = ArgMax(draws);
                var spends = AllocateProportional(thompsonBudget, draws, spendIncrement, topIndex);
                for (var i = 0; i < thompsonPool.Count; i++)
                    allocations.Add(MakeAllocation(thompsonPool[i], Arm.Explore, SamplingPolicy.Thompson,
                        spends[i], epsilon, rngSeed,
                        "explore (Thompson): rank is genuinely uncertain; sampled from the outperformance posterior."));
            }

            if (hasUniform)
            {
                var equal = uniformPool.Select(_ => 1m).ToList();
                var spends = AllocateProportional(uniformBudget, equal, spendIncrement, topIndex: 0);
                for (var i = 0; i < uniformPool.Count; i++)
                    allocations.Add(MakeAllocation(uniformPool[i], Arm.Explore, SamplingPolicy.UniformRandomNoBaseline,
                        spends[i], epsilon, rngSeed,
                        "explore (uniform sub-pool): insufficient_baseline, no posterior; a genuinely unknown creator is the highest-information arm."));
            }
        }

        var totalAllocated = allocations.Sum(a => a.Spend);
        return new AllocationResult(allocations, totalAllocated, unallocatedExploit, unallocatedExplore,
            SamplerVersion, rngSeed, epsilon);
    }

    private static Allocation MakeAllocation(
        AllocationCandidate c, Arm arm, SamplingPolicy policy, decimal spend,
        ExplorationRate epsilon, long rngSeed, string rationale) =>
        new(c.LivePostId, arm, spend, c.Aws, rationale, epsilon, policy, c.ConfidenceBand, rngSeed);

    /// <summary>
    /// Allocate <paramref name="budget"/> proportional to <paramref name="weights"/>, each spend floored to
    /// <paramref name="increment"/>; the rounding residual lands on <paramref name="topIndex"/> so the sum
    /// equals the budget exactly. When every weight is zero, the whole budget lands on the top candidate.
    /// </summary>
    private static decimal[] AllocateProportional(decimal budget, IReadOnlyList<decimal> weights, decimal increment, int topIndex)
    {
        var spends = new decimal[weights.Count];
        if (weights.Count == 0) return spends;

        var sumW = weights.Sum();
        decimal allocated = 0m;
        if (sumW > 0m)
        {
            for (var i = 0; i < weights.Count; i++)
            {
                var raw = budget * weights[i] / sumW;
                var units = Math.Floor(raw / increment);
                spends[i] = units * increment;
                allocated += spends[i];
            }
        }

        spends[topIndex] += budget - allocated;   // residual → top; keeps the sum exact
        return spends;
    }

    private static int ArgMax(IReadOnlyList<decimal> values)
    {
        var best = 0;
        for (var i = 1; i < values.Count; i++)
            if (values[i] > values[best]) best = i;
        return best;
    }
}
