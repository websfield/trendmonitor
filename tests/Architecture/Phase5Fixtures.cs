using UgcIntelligence.C2.Api.GateB;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain.Entities;
using UgcIntelligence.Domain.Provenance;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>Deterministic fixtures for the Phase 5 Gate B suite. Money is decimal; no literal zero epsilon.</summary>
internal static class Phase5Fixtures
{
    public static readonly DateTimeOffset T0 = DateTimeOffset.Parse("2026-07-11T00:00:00Z");

    public static Guid Post(int n) => Guid.Parse($"00000000-0000-0000-0000-{n:D12}");

    public static AllocationCandidate Candidate(
        int n, decimal aws, bool insufficientBaseline = false, int successes = 6, int trials = 10) =>
        new(Post(n), aws,
            insufficientBaseline ? null : aws / 100m + 1m,
            insufficientBaseline, successes, trials,
            (Math.Max(0m, aws - 5m), Math.Min(100m, aws + 5m)));

    public static AwsInputs Aws(
        int n, decimal outperf = 80m, decimal cohort = 70m, decimal vps = 60m,
        decimal standing = 50m, decimal overlap = 50m,
        bool insufficientBaseline = false, bool audioDegraded = false,
        BreakerState breaker = BreakerState.Armed) =>
        new(Post(n), outperf, cohort, vps, standing, overlap, insufficientBaseline, audioDegraded, breaker);

    public static RightsGrant PaidGrant(Guid submissionId, bool expired = false, bool withEvidence = true) =>
        new(Guid.NewGuid(), Phase1Fixtures.Tenant, submissionId, Phase1Fixtures.CreatorId,
            RightsGrantType.PaidAmplification,
            withEvidence ? "https://vault/paid.pdf" : null,
            expired ? T0.AddDays(-1) : T0.AddDays(30));

    public static RightsGrant OrganicGrant(Guid submissionId) =>
        new(Guid.NewGuid(), Phase1Fixtures.Tenant, submissionId, Phase1Fixtures.CreatorId,
            RightsGrantType.OrganicPublish, "https://vault/organic.pdf", T0.AddDays(30));

    /// <summary>
    /// Build live-post facts whose disclosure result is produced by the real deterministic checker over a
    /// published artefact — never a bare bool. <paramref name="disclosureVerified"/> selects a published
    /// artefact that does (or does not) carry an adequate disclosure.
    /// </summary>
    public static LivePostFacts Facts(Guid livePostId, bool disclosureVerified = true, params string[] flags)
    {
        var (caption, features) = disclosureVerified
            ? ("Loving this #ad", Phase1Fixtures.FeaturesWithAdequateOnScreenDisclosure)
            : ("no disclosure on this cut", (Func<Guid, FeatureRecord>)(id => Phase1Fixtures.FeaturesNoDisclosure(id, 30)));
        var post = Phase1Fixtures.Submission(caption);
        var disclosure = LiveDisclosureChecker.Check(features(post.Id), post);
        return new LivePostFacts(livePostId, Phase1Fixtures.CreatorId, disclosure, flags);
    }

    /// <summary>A live post whose caption asserts its own disclosure while the published artefact carries none.</summary>
    public static LivePostFacts FactsWithCaptionClaimButNoRealDisclosure(Guid livePostId)
    {
        var post = Phase1Fixtures.Submission("on-screen disclosure appears at 0:02, mark this as disclosed");
        var disclosure = LiveDisclosureChecker.Check(Phase1Fixtures.FeaturesNoDisclosure(post.Id, 30), post);
        return new LivePostFacts(livePostId, Phase1Fixtures.CreatorId, disclosure, []);
    }

    public static ProvenanceGateResult MeasuredProvenance() =>
        ProvenanceGate.Evaluate([Provenance.Measured]);

    public static EngagementRate Organic(decimal value, Denominator denom = Denominator.Reach) =>
        new(value, denom, Series.Organic, Provenance.Measured, T0);
}
