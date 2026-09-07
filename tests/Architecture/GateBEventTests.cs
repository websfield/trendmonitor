using System.Text.Json;
using UgcIntelligence.C2.Api.GateB;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;
using UgcIntelligence.Events;
using UgcIntelligence.Events.Writer;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>A3. The arm tag is stamped on the allocation and propagates onto the PerformanceSnapshot.</summary>
public sealed class ArmPropagationTests
{
    private static async Task<OutcomeEvent> Single(AppendOnlyEventLog log, OutcomeEventType type)
    {
        var events = new List<OutcomeEvent>();
        await foreach (var e in log.ReplayAsync(Phase1Fixtures.Tenant)) events.Add(e);
        return Assert.Single(events, e => e.EventType == type);
    }

    [Fact]
    public async Task ArmOnAllocation_PropagatesToSnapshot()
    {
        var log = new AppendOnlyEventLog();
        var emitter = new GateBEventEmitter(new OutcomeEventWriter(log));

        var allocation = new Allocation(Phase5Fixtures.Post(1), Arm.Explore, 100m, 62m, "explore",
            ExplorationRate.Default, SamplingPolicy.Thompson, (55m, 69m), RngSeed: 42L);
        await emitter.EmitAmplificationAllocatedAsync(allocation, BetaSampler.Version, Phase1Fixtures.Tenant, Phase5Fixtures.T0);

        var alloc = await Single(log, OutcomeEventType.AmplificationAllocated);
        Assert.Equal("explore", alloc.Payload["arm"]);

        // The snapshot for the same post carries the same arm — this is the only unconfounded evidence C1 gets.
        var snapshot = new PerformanceSnapshot(Phase5Fixtures.Post(1), Horizon.T24h, Phase5Fixtures.Organic(0.05m), Arm.Explore);
        await emitter.EmitPerformanceSnapshotAsync(snapshot, Phase1Fixtures.Tenant);

        var snap = await Single(log, OutcomeEventType.PerformanceSnapshot);
        Assert.Equal("explore", snap.Payload["arm"]);
    }

    /// <summary>The organic and boosted snapshots record distinct series; nothing sums them.</summary>
    [Fact]
    public async Task Snapshot_RecordsSeries_Separately()
    {
        var log = new AppendOnlyEventLog();
        var emitter = new GateBEventEmitter(new OutcomeEventWriter(log));

        await emitter.EmitPerformanceSnapshotAsync(
            new PerformanceSnapshot(Phase5Fixtures.Post(1), Horizon.T24h, Phase5Fixtures.Organic(0.05m), Arm.Exploit),
            Phase1Fixtures.Tenant);

        var snap = await Single(log, OutcomeEventType.PerformanceSnapshot);
        Assert.Equal("organic", snap.Payload["series"]);
        Assert.Equal("reach", snap.Payload["denominator"]);
        Assert.Equal("Measured", snap.Payload["provenance"]);
    }
}

/// <summary>Allocate_EventAppendFails_NotCommitted. Never commit money whose AmplificationAllocated append failed.</summary>
public sealed class GateBEmitterFailureTests
{
    [Fact]
    public async Task Allocate_EventAppendFails_NotCommitted()
    {
        var writer = new ThrowingEventWriter();   // from ComplianceEventTests
        var emitter = new GateBEventEmitter(writer);
        var allocation = new Allocation(Phase5Fixtures.Post(1), Arm.Exploit, 100m, 80m, "x",
            ExplorationRate.Default, SamplingPolicy.ProportionalExploit, (75m, 85m), RngSeed: 1L);

        await Assert.ThrowsAsync<IOException>(() =>
            emitter.EmitAmplificationAllocatedAsync(allocation, BetaSampler.Version, Phase1Fixtures.Tenant, Phase5Fixtures.T0));
        Assert.Equal(1, writer.Attempts);   // it tried, it failed, it did not swallow the failure
    }
}

/// <summary>
/// A14/A17. AmplificationAllocated requires rng_seed and sampler_version (events-v1.json 1.2.0). An event
/// omitting either fails validation, and the C# mirror matches the schema's required array.
/// </summary>
public sealed class AmplificationAllocatedContractTests
{
    private static string RepoRoot()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !File.Exists(Path.Combine(d.FullName, "CLAUDE.md"))) d = d.Parent;
        return d?.FullName ?? throw new InvalidOperationException("repo root not found");
    }

    private static JsonElement Schema() => JsonDocument
        .Parse(File.ReadAllText(Path.Combine(RepoRoot(), "docs", "initial.past", "schemas", "events-v1.json")))
        .RootElement;

    private static string[] SchemaRequired() =>
        [.. Schema().GetProperty("events").GetProperty("AmplificationAllocated").GetProperty("required")
            .EnumerateArray().Select(e => e.GetString()!)];

    private static bool HasAllRequired(IReadOnlyDictionary<string, object?> payload) =>
        AmplificationAllocatedContract.RequiredFields.All(f => payload.ContainsKey(f) && payload[f] is not null);

    [Fact]
    public void RngSeedAndSamplerVersion_AreRequired_InSchema()
    {
        var required = SchemaRequired();
        Assert.Contains("rng_seed", required);
        Assert.Contains("sampler_version", required);
    }

    [Fact]
    public void CSharpMirror_MatchesSchemaRequired_Exactly() =>
        Assert.Equal(SchemaRequired(), AmplificationAllocatedContract.RequiredFields);

    [Fact]
    public void AmplificationAllocated_WithoutSeed_FailsValidation()
    {
        var missingSeed = new Dictionary<string, object?>
        {
            ["live_post_id"] = Guid.NewGuid(), ["arm"] = "explore", ["spend"] = 100m, ["aws"] = 62m,
            ["rationale"] = "x", ["epsilon"] = 0.18m, ["sampler_version"] = BetaSampler.Version,
            // rng_seed deliberately omitted
        };
        Assert.False(HasAllRequired(missingSeed));

        var missingSampler = new Dictionary<string, object?>(missingSeed) { ["rng_seed"] = 42L };
        missingSampler.Remove("sampler_version");
        Assert.False(HasAllRequired(missingSampler));

        var complete = new Dictionary<string, object?>(missingSeed) { ["rng_seed"] = 42L };
        Assert.True(HasAllRequired(complete));
    }

    [Fact]
    public void ContractBumpedTo120_WithChangelog_NothingMutatedInPlace()
    {
        var root = Schema();
        Assert.Equal("1.3.0", root.GetProperty("contract_version").GetString());
        Assert.Equal(OutcomeEventContract.Version, root.GetProperty("contract_version").GetString());

        var changelog = root.GetProperty("changelog");
        Assert.Contains("rng_seed", string.Join(' ', changelog.GetProperty("1.2.0").EnumerateArray().Select(e => e.GetString())));
        // 1.1.0 and 1.2.0 preserved, not mutated in place; 1.3.0 adds VerdictOverridden.human_approved_at.
        Assert.Contains("EXCLUDED_FROM_AI_SCORING", string.Join(' ', changelog.GetProperty("1.1.0").EnumerateArray().Select(e => e.GetString())));
        Assert.Contains("human_approved_at", string.Join(' ', changelog.GetProperty("1.3.0").EnumerateArray().Select(e => e.GetString())));
    }
}
