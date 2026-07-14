using UgcIntelligence.C2.Api.Notes;
using UgcIntelligence.C2.Api.Scoring;
using UgcIntelligence.Domain.Provenance;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// P3-T7 (REQ-016). The revision-note <strong>acceptance</strong> suite. A note is servable only if it is
/// <em>specific</em> (names a concrete change, not a goal), <em>time-coded</em> (carries an m:ss
/// timestamp), <em>exemplified</em> (example copy, a described visual, or a named edit), and
/// <em>bounded</em> (implementable in under two hours). A bare goal like "strengthen the hook" fails.
///
/// <para>This exercises <see cref="RevisionNoteAcceptance.IsAcceptable"/> — <strong>the exact predicate
/// the generator uses</strong> — so the eval-harness and the generator agree in one place. Two directions
/// are proved: a real generated note passes, and every vague variant fails on the axis it violates. A
/// suite that only checked the happy path would certify nothing; each failing case names its own defect.</para>
/// </summary>
public sealed class RevisionNoteAcceptanceTests
{
    private static IReadOnlyDictionary<string, CriterionScore> Criteria(string weakest, decimal weakScore) =>
        JudgeResultValidator.RequiredCriteria.ToDictionary(
            k => k,
            k => new CriterionScore(k == weakest ? weakScore : 85m, $"evidence for {k}", Degraded: false));

    /// <summary>A well-formed note, mutated per-axis by the failing cases below.</summary>
    private static RevisionNote Note(
        string change = "Cut straight to the close-up you currently reach at 0:06 and lead with your strongest line.",
        string timeCode = "0:00-0:02",
        string example = "Overlay 'my dermatologist told me to stop' in 4 words across the upper third at 0:00.",
        bool bounded = true) =>
        new(Composition.HookStrength, timeCode, change, example, bounded,
            new Provenanced<decimal>(78m, Provenance.Estimated, Phase1Fixtures.Now));

    // ---- the note the generator actually produces must pass -----------------------------------------

    /// <summary>
    /// The generator's real output satisfies the shared predicate. If the generator and the acceptance
    /// predicate ever drift apart, this is where it shows — a note the product would serve, judged servable.
    /// </summary>
    [Fact]
    public void RealGeneratedNote_IsAcceptable()
    {
        var note = RevisionNoteGenerator.Generate(Criteria(Composition.HookStrength, 35m), Phase1Fixtures.Now);

        Assert.NotNull(note);
        Assert.True(RevisionNoteAcceptance.IsAcceptable(note!, out var failures),
            $"a note the generator produced was judged unservable: {string.Join("; ", failures)}");
    }

    /// <summary>Every weighted criterion the generator can target yields an acceptable note, not just the hook.</summary>
    [Theory]
    [InlineData(Composition.HookStrength)]
    [InlineData(Composition.ScrollStopPower)]
    [InlineData(Composition.CompletionLikelihood)]
    [InlineData(Composition.Pacing)]
    [InlineData(Composition.EmotionalSpecificity)]
    [InlineData(Composition.TextReadability)]
    [InlineData(Composition.AuthenticityRegister)]
    public void EveryTargetableCriterion_ProducesAnAcceptableNote(string weakest)
    {
        var note = RevisionNoteGenerator.Generate(Criteria(weakest, 20m), Phase1Fixtures.Now);

        Assert.NotNull(note);
        Assert.Equal(weakest, note!.Criterion);
        Assert.True(RevisionNoteAcceptance.IsAcceptable(note, out var failures),
            $"note for {weakest} was judged unservable: {string.Join("; ", failures)}");
    }

    // ---- A8: a generic note fails -------------------------------------------------------------------

    /// <summary>
    /// A8 (the headline case). "strengthen the hook" names an outcome, not an edit; it carries no timestamp,
    /// no example, and is not bounded. It must fail — with a reason that says exactly why.
    /// </summary>
    [Fact]
    public void GenericNote_Fails()
    {
        var generic = new RevisionNote(
            Composition.HookStrength, TimeCode: "", Change: "strengthen the hook", Example: "",
            BoundedUnderTwoHours: false,
            EstimatedVpsIfApplied: new Provenanced<decimal>(0m, Provenance.Estimated, Phase1Fixtures.Now));

        Assert.False(RevisionNoteAcceptance.IsAcceptable(generic, out var failures));
        Assert.Contains(failures, f => f.Contains("goal", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(failures, f => f.Contains("time-coded", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(failures, f => f.Contains("exemplified", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(failures, f => f.Contains("bounded", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Every bare goal in the generator's own generic-goal list is rejected, not just the canonical one.</summary>
    [Theory]
    [InlineData("strengthen the hook")]
    [InlineData("add a hook")]
    [InlineData("improve the hook")]
    [InlineData("make it better")]
    [InlineData("more impact")]
    [InlineData("needs more energy")]
    [InlineData("punch it up")]
    [InlineData("tighten it up")]
    public void ABareGoal_NamesAnOutcomeNotAChange_AndFails(string goal)
    {
        // Given otherwise-valid metadata, a change that is a bare goal still fails: the goal is the defect.
        var note = Note(change: goal);

        Assert.False(RevisionNoteAcceptance.IsAcceptable(note, out var failures),
            $"a bare goal ('{goal}') was accepted as a concrete change.");
        Assert.Contains(failures, f => f.Contains("goal", StringComparison.OrdinalIgnoreCase));
    }

    // ---- each acceptance axis, isolated -------------------------------------------------------------

    /// <summary>Not time-coded: a note with no m:ss timestamp fails, even if specific and exemplified.</summary>
    [Fact]
    public void NoteWithoutTimeCode_Fails()
    {
        var note = Note(timeCode: "early in the video");
        Assert.False(RevisionNoteAcceptance.IsAcceptable(note, out var failures));
        Assert.Contains(failures, f => f.Contains("time-coded", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Not exemplified: a specific, time-coded, bounded note with no example still fails.</summary>
    [Fact]
    public void NoteWithoutExample_Fails()
    {
        var note = Note(example: "   ");
        Assert.False(RevisionNoteAcceptance.IsAcceptable(note, out var failures));
        Assert.Contains(failures, f => f.Contains("exemplified", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Not bounded: a note that cannot be done in under two hours fails, however concrete.</summary>
    [Fact]
    public void NoteThatIsNotBoundedUnderTwoHours_Fails()
    {
        var note = Note(bounded: false);
        Assert.False(RevisionNoteAcceptance.IsAcceptable(note, out var failures));
        Assert.Contains(failures, f => f.Contains("bounded", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Not specific: a change too short to name a concrete edit fails.</summary>
    [Fact]
    public void NoteWithAVagueOneWordChange_Fails()
    {
        var note = Note(change: "fix it");
        Assert.False(RevisionNoteAcceptance.IsAcceptable(note, out var failures));
        Assert.Contains(failures, f => f.Contains("specific", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>The example must add information: one that merely restates the change fails.</summary>
    [Fact]
    public void NoteWhoseExampleRestatesTheChange_Fails()
    {
        const string same = "Cut straight to the close-up at 0:06 and lead with your strongest line.";
        var note = Note(change: same, example: same);
        Assert.False(RevisionNoteAcceptance.IsAcceptable(note, out var failures));
        Assert.Contains(failures, f => f.Contains("restates", StringComparison.OrdinalIgnoreCase));
    }
}
