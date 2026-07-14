using UgcIntelligence.C2.Api.Notes;
using UgcIntelligence.C2.Api.Scoring;
using UgcIntelligence.Domain.Provenance;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// P3-T6. The revision note generator produces one specific, time-coded, exemplified, bounded note, plus
/// an estimated VPS if applied (labelled <c>Estimated</c>). A generic note fails the acceptance predicate.
/// </summary>
public sealed class RevisionNoteGeneratorTests
{
    private static IReadOnlyDictionary<string, CriterionScore> Criteria(string weakest, decimal weakScore) =>
        JudgeResultValidator.RequiredCriteria.ToDictionary(
            k => k,
            k => new CriterionScore(k == weakest ? weakScore : 85m, $"evidence for {k}", Degraded: false));

    [Fact]
    public void Generate_TargetsTheLowestWeightedCriterion_AndIsAcceptable()
    {
        var note = RevisionNoteGenerator.Generate(Criteria(Composition.HookStrength, 35m), Phase1Fixtures.Now);

        Assert.NotNull(note);
        Assert.Equal(Composition.HookStrength, note!.Criterion);
        Assert.True(RevisionNoteAcceptance.IsAcceptable(note, out var failures),
            $"generated note should be acceptable but was not: {string.Join("; ", failures)}");
    }

    [Fact]
    public void Generate_EstimatedVpsIsLabelledEstimated_AndImproves()
    {
        var criteria = Criteria(Composition.HookStrength, 30m);
        var currentVps = Composition.ComposeVps(criteria);
        var note = RevisionNoteGenerator.Generate(criteria, Phase1Fixtures.Now)!;

        Assert.Equal(Provenance.Estimated, note.EstimatedVpsIfApplied.Provenance);
        Assert.True(note.EstimatedVpsIfApplied.Value >= currentVps);
    }

    /// <summary>Shareability (weight 0, diagnostic) is never the target, even when it is the lowest score.</summary>
    [Fact]
    public void Generate_NeverTargetsShareability()
    {
        var criteria = Criteria(Composition.Shareability, 1m);   // shareability is the lowest
        var note = RevisionNoteGenerator.Generate(criteria, Phase1Fixtures.Now)!;
        Assert.NotEqual(Composition.Shareability, note.Criterion);
    }

    /// <summary>A8 (provable). A bare goal like "strengthen the hook" fails acceptance.</summary>
    [Fact]
    public void GenericNote_FailsAcceptance()
    {
        var generic = new RevisionNote(
            Composition.HookStrength, TimeCode: "", Change: "strengthen the hook", Example: "",
            BoundedUnderTwoHours: false,
            EstimatedVpsIfApplied: new Provenanced<decimal>(0m, Provenance.Estimated, Phase1Fixtures.Now));

        Assert.False(RevisionNoteAcceptance.IsAcceptable(generic, out var failures));
        Assert.NotEmpty(failures);
    }
}
