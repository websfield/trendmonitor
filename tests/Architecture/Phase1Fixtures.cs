using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.Domain.Entities;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// Shared, deterministic fixtures for the Phase 1 compliance suite. Every submission below is
/// constructed to satisfy a single named scenario; nothing here reads a clock, a model, or a DB.
/// </summary>
internal static class Phase1Fixtures
{
    public static readonly Guid Tenant = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    public static readonly Guid CampaignId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    public static readonly Guid CreatorId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    public static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-07-11T00:00:00Z");

    public static Submission Submission(string caption = "Loving this new serum #ad", bool sponsored = true) =>
        new(Guid.NewGuid(), Tenant, CampaignId, CreatorId, "tiktok", caption, sponsored, Now);

    public static Creator Adult(int age = 27) => new(CreatorId, Tenant, "@creator", age, []);
    public static Creator AgeUnknown() => new(CreatorId, Tenant, "@creator", null, []);
    public static Creator Minor(int age = 16) => new(CreatorId, Tenant, "@creator", age, []);

    public static Brief BriefNoRequirements() => new(Guid.NewGuid(), Tenant, CampaignId, Technical: null);
    public static Brief BriefWithRequirements() =>
        new(Guid.NewGuid(), Tenant, CampaignId, new TechnicalRequirements(MinDurationSeconds: 10, MaxDurationSeconds: 60));

    public static ClaimsLedger Ledger(params string[] approved) =>
        new(Guid.NewGuid(), Tenant, CampaignId, approved.Length == 0 ? ["clinically proven"] : approved);

    public static RightsGrant OrganicGrantWithEvidence(Guid submissionId) =>
        new(Guid.NewGuid(), Tenant, submissionId, CreatorId, RightsGrantType.OrganicPublish,
            "https://vault.example/signed/organic-123.pdf", ExpiresAt: null);

    public static RightsGrant OrganicGrantWithoutEvidence(Guid submissionId) =>
        new(Guid.NewGuid(), Tenant, submissionId, CreatorId, RightsGrantType.OrganicPublish,
            EvidenceUri: null, ExpiresAt: null);

    /// <summary>A feature record carrying an adequate on-screen disclosure: early, sustained, readable.</summary>
    public static FeatureRecord FeaturesWithAdequateOnScreenDisclosure(Guid submissionId) =>
        new(Guid.NewGuid(), submissionId, "3.2.1", AudioPresent: true, DurationSeconds: 30,
            AspectRatio: "9:16", Width: 1080, Height: 1920, Transcript: "here is the product",
            OnScreenText: [],
            DisclosureSignals:
            [
                new DisclosureSignal("Paid partnership", DisclosureSurface.OnScreenText,
                    StartMs: 500, EndMs: 3500, Box: new BoundingBox(0.1, 0.1, 0.6, 0.08)),
            ]);

    /// <summary>A feature record with no disclosure signal at all (empty), valid format.</summary>
    public static FeatureRecord FeaturesNoDisclosure(Guid submissionId, int duration = 30) =>
        new(Guid.NewGuid(), submissionId, "3.2.1", AudioPresent: true, DurationSeconds: duration,
            AspectRatio: "9:16", Width: 1080, Height: 1920, Transcript: "here is the product",
            OnScreenText: [], DisclosureSignals: []);

    /// <summary>Build a ComplianceResult directly from a set of veto results, for verdict-engine tests.</summary>
    public static ComplianceResult Compliance(params VetoResult[] vetoes) => new(vetoes);

    public static VetoResult Pass(string id) => VetoResult.Pass(id, $"{id} ok");
    public static VetoResult Fire(string id) => VetoResult.Fire(id, $"{id} fired");
    public static VetoResult Unevaluable(string id) => VetoResult.Unevaluable(id, $"{id} unevaluable");

    /// <summary>All six vetoes passing — the clean baseline a subset test mutates.</summary>
    public static VetoResult[] AllPass() =>
        [Pass("V1"), Pass("V2"), Pass("V3"), Pass("V4"), Pass("V5"), Pass("V6")];
}
