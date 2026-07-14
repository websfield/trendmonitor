namespace UgcIntelligence.C2.Api.Verdicts;

/// <summary>
/// REQ-015 enumerates exactly four verdicts. The last two members are <strong>routing states</strong>,
/// not verdicts: they send a submission to a human instead of forcing a false verdict.
///
/// <list type="bullet">
/// <item><see cref="NEEDS_REVIEW"/> — a veto could not be evaluated (fail closed), or, in Phase 1,
/// there is no scoring lane yet, so a submission with no fired veto still awaits the human click.</item>
/// <item><see cref="EXCLUDED_FROM_AI_SCORING"/> — V6's terminal state
/// (<c>schemas/rubric-v1.json</c>:20). A minor's submission is excluded entirely, which is a
/// different act, with a different record, from a REJECTED submission.</item>
/// </list>
///
/// Do not "tidy" this enum to the four REQ-015 verdicts: forcing an unevaluable or excluded
/// submission into one of the four would be a false verdict.
/// </summary>
public enum Verdict
{
    APPROVED,
    APPROVED_WITH_NOTES,
    REVISIONS_REQUIRED,
    REJECTED,
    NEEDS_REVIEW,
    EXCLUDED_FROM_AI_SCORING,
}
