using System.Text.Json;
using UgcIntelligence.Domain;
using UgcIntelligence.Domain.Provenance;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// The control plane is C# and the intelligence plane is Python, but they must agree exactly on
/// which provenance may enter an effect-size calculation. If they ever disagree, one of them is
/// laundering a <c>Proxy</c> value — and it will be the one nobody is looking at.
///
/// <para>Both suites read the same fixture table at <c>tests/fixtures/provenance-parity.json</c>.
/// A divergence is a build failure, not a code-review finding.</para>
/// </summary>
public sealed class ProvenanceParityTests
{
    private static string RepoRoot()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !File.Exists(Path.Combine(d.FullName, "CLAUDE.md"))) d = d.Parent;
        return d?.FullName ?? throw new InvalidOperationException("repo root not found");
    }

    private static JsonElement Fixture(string section) => JsonDocument
        .Parse(File.ReadAllText(Path.Combine(RepoRoot(), "tests", "fixtures", "provenance-parity.json")))
        .RootElement.GetProperty(section);

    private static Provenance Parse(string label) => label switch
    {
        "Measured" => Provenance.Measured,
        "User-provided" => Provenance.UserProvided,
        "Estimated" => Provenance.Estimated,
        "Proxy" => Provenance.Proxy,
        _ => throw new ArgumentOutOfRangeException(nameof(label), label, "unknown provenance label"),
    };

    [Fact]
    public void CSharp_MatchesTheSharedParityFixture()
    {
        foreach (var row in Fixture("admits_to_measured_outcome").EnumerateArray())
        {
            var provenance = Parse(row.GetProperty("provenance").GetString()!);
            var expected = row.GetProperty("admitted").GetBoolean();

            var admitted = MeasuredOutcome.TryFrom(new Provenanced<decimal>(1.41m, provenance, DateTimeOffset.UnixEpoch))
                           is not null;

            Assert.True(admitted == expected,
                $"C# admits {provenance} = {admitted}, fixture says {expected}. " +
                row.GetProperty("why").GetString());
        }
    }

    [Fact]
    public void ExplorationRate_MatchesTheSharedParityFixture()
    {
        foreach (var row in Fixture("exploration_rate").EnumerateArray())
        {
            var value = row.GetProperty("value").GetDecimal();
            var expectedAccepted = row.GetProperty("accepted").GetBoolean();
            var why = row.GetProperty("why").GetString();

            if (expectedAccepted)
                Assert.Equal(value, ExplorationRate.From(value).Value);
            else
                Assert.Throws<ExplorationRateOutOfBoundsException>(() => ExplorationRate.From(value));
        }
    }

    /// <summary>The fixture must actually cover every provenance the enum defines, or parity is partial.</summary>
    [Fact]
    public void TheFixture_CoversEveryProvenance()
    {
        var covered = Fixture("admits_to_measured_outcome").EnumerateArray()
            .Select(r => Parse(r.GetProperty("provenance").GetString()!)).ToHashSet();

        Assert.Equal(Enum.GetValues<Provenance>().ToHashSet(), covered);
    }
}
