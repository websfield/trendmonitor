using System.Text.Json;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// The eval plan's schema check, verbatim in intent:
/// <em>"A test asserts that adding any of them fails validation. This is the check that survives a
/// well-meaning engineer who wants to 'just add a confidence score.'"</em>
///
/// <para>These assertions read the real contract at <c>docs/initial/schemas/mechanisms-v1.json</c>.
/// If that file stops forbidding a field, this test goes red — which is the point.</para>
/// </summary>
public sealed class MechanismSchemaTests
{
    private static string RepoRoot()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !File.Exists(Path.Combine(d.FullName, "CLAUDE.md"))) d = d.Parent;
        return d?.FullName ?? throw new InvalidOperationException("repo root not found");
    }

    private static JsonElement Schema() => JsonDocument
        .Parse(File.ReadAllText(Path.Combine(RepoRoot(), "docs", "initial", "schemas", "mechanisms-v1.json")))
        .RootElement;

    /// <summary>Every key through which a laundered number, or the amplification arm, could arrive.</summary>
    [Theory]
    [InlineData("effect_size")]
    [InlineData("effect_ci")]
    [InlineData("effect_ci_low")]
    [InlineData("effect_ci_high")]
    [InlineData("lift")]
    [InlineData("vps")]
    [InlineData("aws")]
    [InlineData("spearman")]
    [InlineData("predicted_performance")]
    [InlineData("arm")]
    public void ForbiddenField_IsDeclaredForbidden_AndAbsentFromTheMechanismProperties(string field)
    {
        var schema = Schema();

        var forbidden = schema.GetProperty("forbidden_fields").GetProperty("keys")
            .EnumerateArray().Select(x => x.GetString()).ToArray();
        Assert.Contains(field, forbidden);

        var props = schema.GetProperty("$defs").GetProperty("mechanism").GetProperty("properties");
        Assert.False(props.TryGetProperty(field, out _),
            $"'{field}' appears on the Mechanism object. A Mechanism carries no effect size, by schema.");
    }

    /// <summary>
    /// <c>additionalProperties: false</c> is what turns "we don't put an effect size on it" into
    /// "adding one breaks validation rather than shipping a laundered number quietly."
    /// </summary>
    [Fact]
    public void Mechanism_SetsAdditionalPropertiesFalse()
    {
        var mechanism = Schema().GetProperty("$defs").GetProperty("mechanism");
        Assert.False(mechanism.GetProperty("additionalProperties").GetBoolean());
    }

    [Fact]
    public void MechanismEvidence_SetsAdditionalPropertiesFalse()
    {
        var evidence = Schema().GetProperty("$defs").GetProperty("mechanism")
            .GetProperty("properties").GetProperty("evidence");
        Assert.False(evidence.GetProperty("additionalProperties").GetBoolean());
    }

    /// <summary>REQ-063. A mechanism without a stated falsifier is not a mechanism, it is a caption.</summary>
    [Theory]
    [InlineData("falsifier")]
    [InlineData("warrant")]
    [InlineData("statement")]
    [InlineData("feature_predicate")]
    [InlineData("evidence")]
    [InlineData("provenance")]
    [InlineData("ingestion_arm")]
    [InlineData("ratified_by")]
    [InlineData("ratified_at")]
    [InlineData("ratification_note")]
    public void RequiredField_IsRequired(string field)
    {
        var required = Schema().GetProperty("$defs").GetProperty("mechanism").GetProperty("required")
            .EnumerateArray().Select(x => x.GetString()).ToArray();
        Assert.Contains(field, required);
    }

    /// <summary>
    /// REQ-065a. A single-slice <c>contrasted</c> is a description of its own mining window, and must
    /// fail validation rather than merely violate prose.
    /// </summary>
    [Fact]
    public void Contrasted_RequiresAtLeastTwoTemporalSlices()
    {
        var allOf = Schema().GetProperty("$defs").GetProperty("mechanism").GetProperty("allOf");
        var rule = allOf.EnumerateArray().Single();

        Assert.Equal("contrasted",
            rule.GetProperty("if").GetProperty("properties").GetProperty("warrant").GetProperty("const").GetString());
        Assert.Equal(2,
            rule.GetProperty("then").GetProperty("properties").GetProperty("evidence")
                .GetProperty("properties").GetProperty("temporal_slices").GetProperty("minItems").GetInt32());
    }

    /// <summary>The warrant ladder's top two rungs are named and refused. A ladder whose top is invisible gets climbed by accident.</summary>
    [Theory]
    [InlineData("deconfounded_within_tenant")]
    [InlineData("interventional")]
    public void RefusedRung_IsNamed_AndMarkedOutOfScope(string rung)
    {
        var rungs = Schema().GetProperty("warrant_ladder").GetProperty("rungs").EnumerateArray()
            .Where(r => r.GetProperty("warrant").GetString() == rung).ToArray();

        var found = Assert.Single(rungs);
        Assert.Equal("OUT OF SCOPE BY DESIGN", found.GetProperty("status").GetString());
    }

    /// <summary>Only recurrent and contrasted are served. falsified and conjectured ship for auditability and are never retrieved.</summary>
    [Theory]
    [InlineData("conjectured", false)]
    [InlineData("recurrent", true)]
    [InlineData("contrasted", true)]
    [InlineData("falsified", false)]
    public void ServedByC4_MatchesTheWarrantLadder(string rung, bool served)
    {
        var found = Schema().GetProperty("warrant_ladder").GetProperty("rungs").EnumerateArray()
            .Single(r => r.GetProperty("warrant").GetString() == rung);
        Assert.Equal(served, found.GetProperty("served_by_c4").GetBoolean());
    }

    /// <summary>C3 has no role. Giving it a veto here would be authority theatre.</summary>
    [Fact]
    public void C3_HasNoRoleInTheWarrantLadder() =>
        Assert.Equal("NO ROLE.",
            Schema().GetProperty("warrant_ladder").GetProperty("who_gates_this")
                    .GetProperty("c3_calibration_monitor").GetString());

    /// <summary>The mechanism library key has no tenant axis. A tenant on this key would mean a tenant's data got in.</summary>
    [Fact]
    public void LibraryManifest_HasNoTenantAxis()
    {
        var props = Schema().GetProperty("library_manifest").GetProperty("properties");
        Assert.False(props.TryGetProperty("tenant_id", out _));
        Assert.Contains("No tenant_id",
            props.GetProperty("mechanism_library_version").GetProperty("description").GetString()!);
    }
}

/// <summary>The three published contracts parse. This is the project's entry gate.</summary>
public sealed class ContractSchemaParseTests
{
    private static string RepoRoot()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !File.Exists(Path.Combine(d.FullName, "CLAUDE.md"))) d = d.Parent;
        return d?.FullName ?? throw new InvalidOperationException("repo root not found");
    }

    [Theory]
    [InlineData("rubric-v1.json")]
    [InlineData("events-v1.json")]
    [InlineData("mechanisms-v1.json")]
    public void ContractSchema_Parses(string file)
    {
        var path = Path.Combine(RepoRoot(), "docs", "initial", "schemas", file);
        Assert.True(File.Exists(path), $"missing contract schema: {path}");
        _ = JsonDocument.Parse(File.ReadAllText(path));
    }

    /// <summary>REQ-005e / REQ-066, recorded machine-readably: neither a trend nor a mechanism enters VPS or AWS.</summary>
    [Theory]
    [InlineData("trend_signal")]
    [InlineData("mechanism")]
    [InlineData("mechanism_statement")]
    public void Rubric_RecordsForbiddenScoringInput(string key)
    {
        var path = Path.Combine(RepoRoot(), "docs", "initial", "schemas", "rubric-v1.json");
        var forbidden = JsonDocument.Parse(File.ReadAllText(path)).RootElement
            .GetProperty("scoring_inputs_forbidden");
        Assert.True(forbidden.TryGetProperty(key, out _));
    }

    /// <summary>The model may score criteria and raise a suspected veto. It may never clear one, or assign a verdict.</summary>
    [Theory]
    [InlineData("clear a veto")]
    [InlineData("downgrade a veto")]
    [InlineData("weight or influence a veto")]
    [InlineData("assign a verdict")]
    [InlineData("allocate budget")]
    [InlineData("ratify a mechanism")]
    public void Rubric_ForbidsTheModel(string prohibition)
    {
        var path = Path.Combine(RepoRoot(), "docs", "initial", "schemas", "rubric-v1.json");
        var mayNever = JsonDocument.Parse(File.ReadAllText(path)).RootElement
            .GetProperty("model_authority").GetProperty("may_never")
            .EnumerateArray().Select(x => x.GetString()).ToArray();
        Assert.Contains(prohibition, mayNever);
    }
}
