using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Triage;
using UgcIntelligence.C2.Api.Verdicts;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>A11, REQ-019. The queue is sorted compliance risks first, then borderline, then clear passes.</summary>
public sealed class TriageSorterTests
{
    private static ComplianceResult Clean() => new(Phase1Fixtures.AllPass());
    private static ComplianceResult WithFired(string id) =>
        new([.. Phase1Fixtures.AllPass().Select(v => v.Id == id ? VetoResult.Fire(id, "x") : v)]);
    private static ComplianceResult WithUnevaluable(string id) =>
        new([.. Phase1Fixtures.AllPass().Select(v => v.Id == id ? VetoResult.Unevaluable(id, "?") : v)]);

    [Fact]
    public void ComplianceRisksFirst()
    {
        var clearPass = new TriageItem(Guid.NewGuid(), Verdict.APPROVED, Clean());
        var borderline = new TriageItem(Guid.NewGuid(), Verdict.APPROVED_WITH_NOTES, Clean());
        var rejected = new TriageItem(Guid.NewGuid(), Verdict.REJECTED, WithFired("V1"));
        var excluded = new TriageItem(Guid.NewGuid(), Verdict.EXCLUDED_FROM_AI_SCORING, WithFired("V6"));
        var unevaluable = new TriageItem(Guid.NewGuid(), Verdict.NEEDS_REVIEW, WithUnevaluable("V6"));

        // Deliberately shuffled input order: clear pass first, risks last.
        var sorted = TriageSorter.Sort([clearPass, borderline, rejected, excluded, unevaluable]);

        // Every compliance risk sorts ahead of every borderline, which sorts ahead of every clear pass.
        var priorities = sorted.Select(TriageSorter.Priority).ToList();
        Assert.Equal(priorities.OrderBy(p => p), priorities);   // non-decreasing

        Assert.Equal(0, TriageSorter.Priority(sorted[0]));       // a compliance risk is on top
        Assert.Equal(Verdict.APPROVED, sorted[^1].Verdict);     // the clear pass is at the bottom
    }

    [Fact]
    public void CleanNeedsReview_IsBorderline_NotAComplianceRisk()
    {
        // A clean submission awaiting the human click is borderline (needs judgement), not a compliance risk.
        var item = new TriageItem(Guid.NewGuid(), Verdict.NEEDS_REVIEW, Clean());
        Assert.Equal(1, TriageSorter.Priority(item));
    }

    [Fact]
    public void Sort_IsStable_WithinAPriorityBand()
    {
        var a = new TriageItem(Guid.NewGuid(), Verdict.APPROVED_WITH_NOTES, Clean());
        var b = new TriageItem(Guid.NewGuid(), Verdict.APPROVED_WITH_NOTES, Clean());
        var sorted = TriageSorter.Sort([a, b]);
        Assert.Equal(a.SubmissionId, sorted[0].SubmissionId);
        Assert.Equal(b.SubmissionId, sorted[1].SubmissionId);
    }
}
