using UgcIntelligence.Contracts.Mechanisms;

namespace UgcIntelligence.KnowledgeApi.Serving;

/// <summary>
/// Decides what is served — a read of a decision already made, not a decision. Only <c>recurrent</c> and
/// <c>contrasted</c> mechanisms are served as active, <strong>and only if a named human ratified them</strong>
/// with a non-empty note. <c>conjectured</c>/<c>falsified</c>/<c>retired</c> ship in the artefact for audit
/// and are never served as active. There is no <c>?include_unratified</c> parameter, admin path, or
/// internal-caller exemption (A10) — that is why this filter has no bypass argument.
/// </summary>
public static class WarrantFilter
{
    private static readonly IReadOnlySet<Warrant> ServedRungs = new HashSet<Warrant> { Warrant.Recurrent, Warrant.Contrasted };

    /// <summary>Whether a warrant rung is served as active. Nothing outside {recurrent, contrasted} ever is.</summary>
    public static bool IsServedRung(Warrant warrant) => ServedRungs.Contains(warrant);

    /// <summary>
    /// Whether a mechanism is served: a served rung, ratified, and clear of the serve-time forbidden-verb
    /// lexicon on <strong>both its statement and its falsifier</strong> — both are served fields, so a
    /// model-drafted falsifier carrying <em>causes</em>/<em>drives</em> must not ship past the serve-time
    /// checkpoint any more than the statement may. Every clause must hold; no argument relaxes any of them.
    /// </summary>
    public static bool IsServed(Mechanism mechanism) =>
        IsServedRung(mechanism.Warrant)
        && mechanism.IsRatified
        && !ForbiddenVerbLexicon.ContainsForbiddenVerb(mechanism.Statement)
        && !ForbiddenVerbLexicon.ContainsForbiddenVerb(mechanism.Falsifier);
}
