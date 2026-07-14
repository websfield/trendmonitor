namespace UgcIntelligence.C2.Api.Compliance;

/// <summary>
/// The outcome of one veto (REQ-010: a binary per-check result <em>with evidence</em>).
///
/// <para><see cref="Evaluable"/> is the load-bearing third state. A veto that could not be computed —
/// extraction down, ledger absent, age unestablished — is <c>Evaluable = false</c>, and
/// <strong>an unevaluable veto never counts as passed</strong>. It routes the submission to a human,
/// it does not clear the check.</para>
/// </summary>
/// <param name="Id">The veto id, <c>V1</c>..<c>V6</c>.</param>
/// <param name="Fired">True when the check failed. A fired V1..V5 forces REJECTED; a fired V6 excludes.</param>
/// <param name="Evaluable">False when the check could not be computed from available inputs.</param>
/// <param name="Evidence">Human-readable justification. Every result carries one, pass or fail.</param>
public sealed record VetoResult(string Id, bool Fired, bool Evaluable, string Evidence)
{
    /// <summary>A check that fired on evidence it could actually compute.</summary>
    public static VetoResult Fire(string id, string evidence) => new(id, Fired: true, Evaluable: true, evidence);

    /// <summary>A check that ran and found no violation.</summary>
    public static VetoResult Pass(string id, string evidence) => new(id, Fired: false, Evaluable: true, evidence);

    /// <summary>A check that could not be computed. Never a pass; routes to a human.</summary>
    public static VetoResult Unevaluable(string id, string evidence) => new(id, Fired: false, Evaluable: false, evidence);
}

/// <summary>
/// REQ-010. The six-veto result of one compliance run. The gate produces exactly one of these per
/// submission; the verdict engine consumes it as a pure input.
/// </summary>
public sealed record ComplianceResult(IReadOnlyList<VetoResult> Vetoes)
{
    /// <summary>Any V1..V6 fired.</summary>
    public bool AnyFired => Vetoes.Any(v => v.Fired);

    /// <summary>Any veto could not be evaluated. Such a submission can never be approved.</summary>
    public bool AnyUnevaluable => Vetoes.Any(v => !v.Evaluable);

    /// <summary>The result for one veto id, or null if it was not part of this run.</summary>
    public VetoResult? Veto(string id) => Vetoes.FirstOrDefault(v => v.Id == id);

    /// <summary>The ids of the vetoes that fired, in <c>V1</c>..<c>V6</c> order, for the event payload.</summary>
    public IReadOnlyList<string> FiredIds => [.. Vetoes.Where(v => v.Fired).Select(v => v.Id)];

    /// <summary>The ids of the vetoes that could not be evaluated — the reasons a submission is held.</summary>
    public IReadOnlyList<string> UnevaluableIds => [.. Vetoes.Where(v => !v.Evaluable).Select(v => v.Id)];
}
