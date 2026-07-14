using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Verdicts;

namespace UgcIntelligence.C2.Api.Triage;

/// <summary>One item in the manager's review queue: a submission, its verdict, and its compliance result.</summary>
public sealed record TriageItem(Guid SubmissionId, Verdict Verdict, ComplianceResult Compliance);

/// <summary>
/// REQ-019, P1-T7. Order the queue so attention lands where judgement is required: <strong>compliance
/// risks first, then borderline verdicts, then clear passes.</strong>
///
/// <para>This is not cosmetic. It halves triage time (success metric one), and it keeps the human
/// review step in REQ-021 real: a reviewer who approves forty submissions in ninety seconds has not
/// exercised judgement. Putting the hard decisions at the top is what stops the human step decaying
/// into a rubber stamp.</para>
/// </summary>
public static class TriageSorter
{
    private const int ComplianceRisk = 0;   // fired or unevaluable veto; REJECTED/EXCLUDED
    private const int Borderline = 1;       // APPROVED_WITH_NOTES; NEEDS_REVIEW; REVISIONS_REQUIRED
    private const int ClearPass = 2;        // APPROVED

    /// <summary>Stable sort by triage priority; submission order is preserved within a priority band.</summary>
    public static IReadOnlyList<TriageItem> Sort(IEnumerable<TriageItem> items) =>
        [.. items.OrderBy(Priority)];

    /// <summary>The triage band for one item. Lower sorts first.</summary>
    public static int Priority(TriageItem item)
    {
        // A live compliance concern always sorts first, whatever the verdict label says.
        if (item.Compliance.AnyFired || item.Compliance.AnyUnevaluable)
            return ComplianceRisk;

        return item.Verdict switch
        {
            Verdict.REJECTED or Verdict.EXCLUDED_FROM_AI_SCORING => ComplianceRisk,
            Verdict.APPROVED_WITH_NOTES or Verdict.NEEDS_REVIEW or Verdict.REVISIONS_REQUIRED => Borderline,
            Verdict.APPROVED => ClearPass,
            _ => Borderline,
        };
    }
}
