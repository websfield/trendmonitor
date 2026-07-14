using System.Text.Json;
using UgcIntelligence.Contracts;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// A12. The Contract B bump: <c>events-v1.json</c> at 1.1.0 records <c>EXCLUDED_FROM_AI_SCORING</c> on
/// <c>VerdictIssued.verdict</c>, and the C# mirror does not drift from it. Reads the real contract file.
/// </summary>
public sealed class VerdictIssuedContractTests
{
    private static string RepoRoot()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !File.Exists(Path.Combine(d.FullName, "CLAUDE.md"))) d = d.Parent;
        return d?.FullName ?? throw new InvalidOperationException("repo root not found");
    }

    private static JsonElement Schema() => JsonDocument
        .Parse(File.ReadAllText(Path.Combine(RepoRoot(), "docs", "initial", "schemas", "events-v1.json")))
        .RootElement;

    private static string[] SchemaVerdictEnum() =>
        [.. Schema().GetProperty("events").GetProperty("VerdictIssued").GetProperty("properties")
            .GetProperty("verdict").GetProperty("enum").EnumerateArray().Select(e => e.GetString()!)];

    /// <summary>A12. The schema enum can record EXCLUDED_FROM_AI_SCORING; a V6-excluded minor is recorded as itself.</summary>
    [Fact]
    public void ExcludedFromAiScoring_IsRecordable()
    {
        Assert.Contains("EXCLUDED_FROM_AI_SCORING", SchemaVerdictEnum());
        Assert.Contains(RecordableVerdict.EXCLUDED_FROM_AI_SCORING.ToString(), SchemaVerdictEnum());
    }

    /// <summary>The contract version was bumped to 1.1.0 with a changelog; 1.0.0 is not mutated in place.</summary>
    [Fact]
    public void ContractVersion_IsBumped_WithChangelog()
    {
        var root = Schema();
        Assert.Equal("1.3.0", root.GetProperty("contract_version").GetString());
        Assert.Equal(OutcomeEventContract.Version, root.GetProperty("contract_version").GetString());

        Assert.True(root.TryGetProperty("changelog", out var changelog));

        // 1.1.0 is preserved, not mutated in place: its EXCLUDED_FROM_AI_SCORING entry still stands.
        Assert.True(changelog.TryGetProperty("1.1.0", out var v11));
        Assert.Contains("EXCLUDED_FROM_AI_SCORING", string.Join(' ', v11.EnumerateArray().Select(e => e.GetString())));

        // 1.2.0 records the rng_seed addition.
        Assert.True(changelog.TryGetProperty("1.2.0", out var v12));
        Assert.Contains("rng_seed", string.Join(' ', v12.EnumerateArray().Select(e => e.GetString())));

        // 1.3.0 records the VerdictOverridden human_approved_at addition (REQ-021, audit finding #1).
        Assert.True(changelog.TryGetProperty("1.3.0", out var v13));
        Assert.Contains("human_approved_at", string.Join(' ', v13.EnumerateArray().Select(e => e.GetString())));
    }

    /// <summary>Drift guard: the C# RecordableVerdict enum matches the schema enum, member for member.</summary>
    [Fact]
    public void CSharpMirror_DoesNotDriftFromSchema()
    {
        var schema = SchemaVerdictEnum().OrderBy(x => x, StringComparer.Ordinal).ToArray();
        var csharp = Enum.GetNames<RecordableVerdict>().OrderBy(x => x, StringComparer.Ordinal).ToArray();
        Assert.Equal(schema, csharp);
    }

    /// <summary>NEEDS_REVIEW remains recordable — the pre-existing routing state was not dropped by the bump.</summary>
    [Fact]
    public void NeedsReview_RemainsRecordable()
    {
        Assert.Contains("NEEDS_REVIEW", SchemaVerdictEnum());
    }
}
