using UgcIntelligence.Contracts.Mechanisms;
using UgcIntelligence.KnowledgeApi.Resolution;

namespace UgcIntelligence.KnowledgeApi.Serving;

/// <summary>
/// P8-T9 response composer + coverage reporter. Turns a <see cref="ResolveResult"/> into a served
/// collection: it filters to ratified, served-rung, lexicon-clean mechanisms, composes each into a
/// <see cref="MechanismView"/> carrying every required field and no magnitude, and builds the
/// <see cref="Coverage"/> that explains any emptiness — never leaving an empty response looking like an
/// absence of structure.
/// </summary>
public sealed class ResponseComposer(TimeProvider? clock = null)
{
    private const int CorpusStaleDays = 30;

    private readonly TimeProvider _clock = clock ?? TimeProvider.System;

    /// <summary>Compose a mechanisms collection, honouring an optional exact-warrant filter (recurrent|contrasted).</summary>
    public MechanismCollection ComposeCollection(ResolveResult result, Warrant? warrantFilter = null)
    {
        if (result.Library is null)
        {
            // A null library here means exactly one thing: no active_version (no_library). A degraded status
            // (refuse-on-mismatch, store-unreachable-no-cache) is a 503 and must be handled by the caller
            // BEFORE composing — it has no coverage state to wear. Fail fast rather than mislabel it no_library
            // if that pre-check is ever refactored away.
            if (result.Status != ResolveStatus.NoLibrary)
                throw new InvalidOperationException(
                    $"ComposeCollection received degraded resolve status {result.Status} with no library. "
                    + "Degraded statuses are 503 and must be handled before composing (KnowledgeApiEndpoints.IsUnavailable).");

            return new MechanismCollection(
                [],
                new Coverage(CoverageState.NoLibrary.ToSnake(), null, 0, 0, "no active_version for this cohort",
                    null, result.StaleAsOf, result.Alarm),
                null, null);
        }

        var library = result.Library;
        var served = library.Mechanisms
            .Where(WarrantFilter.IsServed)
            .Where(m => warrantFilter is null || m.Warrant == warrantFilter)
            .Select(m => Compose(m, library))
            .ToList();

        var coverage = ComposeCoverage(library, served.Count, result);
        return new MechanismCollection(served, coverage, library.MechanismLibraryVersion, library.Sha256);
    }

    /// <summary>Compose one mechanism into a served view carrying every required field (A12) and no magnitude (A11).</summary>
    public static MechanismView Compose(Mechanism m, MechanismLibrary library) =>
        new(
            m.Id, m.Statement, m.FeaturePredicate, m.Falsifier, m.Warrant.ToSnake(),
            new EvidenceView(
                m.Evidence.NExemplars, m.Evidence.NCreators, m.Evidence.NCohorts, m.Evidence.NTrends,
                m.Evidence.PrevalenceInTopDecile, m.Evidence.PrevalenceInContrastSet, m.Evidence.PrevalenceRatio,
                m.Evidence.ContrastSetDefinition,
                [.. m.Evidence.TemporalSlices.Select(s => new TemporalSliceView(s.From, s.To, s.PrevalenceRatio))]),
            new ProvenanceView(m.Provenance.CorpusSelection, m.Provenance.PredicateEvaluation, m.Provenance.Label),
            m.NeverTestedAgainst, m.IngestionArm, m.OccasionedByTrendIds ?? [],
            m.RatifiedBy, m.RatifiedAt, m.ValidFrom, m.ValidTo,
            library.MechanismLibraryVersion, library.Sha256);

    /// <summary>
    /// Turn the manifest's exemplar records into served views: a URI is withheld when the source forbids
    /// redistribution (counts survive), and marked <c>unresolvable</c> when the source post was deleted after
    /// the snapshot (counts survive — the prevalences were computed at the corpus snapshot).
    /// </summary>
    public static IReadOnlyList<ExemplarView> ComposeExemplars(IReadOnlyList<ExemplarRecord> records) =>
        [.. records.Select(r => r switch
        {
            { Redistributable: false } => new ExemplarView(null, r.ObservedAt, r.PredicateSatisfied, "withheld_no_redistribute"),
            { Deleted: true } => new ExemplarView(r.PublicPostUri, r.ObservedAt, r.PredicateSatisfied, "unresolvable"),
            _ => new ExemplarView(r.PublicPostUri, r.ObservedAt, r.PredicateSatisfied, "resolvable"),
        })];

    private Coverage ComposeCoverage(MechanismLibrary library, int servedCount, ResolveResult result)
    {
        var total = library.Mechanisms.Count;
        var falsified = library.Mechanisms.Count(m => m.Warrant is Warrant.Falsified);
        var unratified = library.Mechanisms.Count(m => WarrantFilter.IsServedRung(m.Warrant) && !m.IsRatified);
        var forbiddenVerb = library.Mechanisms.Count(m =>
            WarrantFilter.IsServedRung(m.Warrant) && m.IsRatified
            && (ForbiddenVerbLexicon.ContainsForbiddenVerb(m.Statement) || ForbiddenVerbLexicon.ContainsForbiddenVerb(m.Falsifier)));
        var belowRung = library.Mechanisms.Count(m => m.Warrant is Warrant.Conjectured or Warrant.Retired);

        var blocking =
            $"served: {servedCount}; below_warrant_bar: {belowRung}; falsified: {falsified}; "
            + $"blocked_unratified: {unratified}; blocked_forbidden_verb: {forbiddenVerb}";

        var corpusLastRefreshed = CorpusDate(library);
        var stale = corpusLastRefreshed is { } d && (_clock.GetUtcNow() - d).TotalDays > CorpusStaleDays;

        // corpus_stale is surfaced even when mechanisms are served — a decaying library nobody notices is the
        // quiet failure mode. Otherwise: served when something cleared the bar; below_warrant_bar when nothing did.
        var state = stale
            ? CoverageState.CorpusStale
            : servedCount > 0 ? CoverageState.Served : CoverageState.BelowWarrantBar;

        return new Coverage(
            state.ToString().ToSnake(), library.MechanismLibraryVersion, total, servedCount, blocking,
            corpusLastRefreshed?.ToString("yyyy-MM-dd"), result.StaleAsOf, result.Alarm);
    }

    private static DateTimeOffset? CorpusDate(MechanismLibrary library) =>
        DateTimeOffset.TryParse(library.CutAt, out var d) ? d : null;
}

internal static class SnakeCaseExtensions
{
    /// <summary>lowercase snake_case token for coverage.state / warrant on the wire (below_warrant_bar, etc.).</summary>
    public static string ToSnake(this string pascalOrEnum)
    {
        var chars = new List<char>();
        for (var i = 0; i < pascalOrEnum.Length; i++)
        {
            var c = pascalOrEnum[i];
            if (char.IsUpper(c) && i > 0) chars.Add('_');
            chars.Add(char.ToLowerInvariant(c));
        }
        return new string([.. chars]);
    }

    public static string ToSnake(this Warrant warrant) => warrant.ToString().ToSnake();
    public static string ToSnake(this CoverageState state) => state.ToString().ToSnake();
}
