using System.Text.Json;

namespace UgcIntelligence.KnowledgeApi.Serving;

/// <summary>
/// A served mechanism. Every field required by REQ-067/A12 is present and non-optional: <see cref="Warrant"/>,
/// <see cref="ProvenanceLabel"/>, <see cref="NeverTestedAgainst"/>, <see cref="Falsifier"/>,
/// <see cref="MechanismLibraryVersion"/>, <see cref="Sha256"/>.
///
/// <para><strong>There is no <c>0-100</c> field and no <c>effect_size</c> here</strong> (A11): the only
/// quantity is <see cref="Evidence"/>'s <c>prevalence_ratio</c>, a descriptive asymmetry that ships wrapped
/// in its warrant and provenance so it cannot be read as a lift.</para>
/// </summary>
public sealed record MechanismView(
    string Id,
    string Statement,
    JsonElement FeaturePredicate,
    string Falsifier,
    string Warrant,
    EvidenceView Evidence,
    ProvenanceView Provenance,
    string NeverTestedAgainst,
    string IngestionArm,
    IReadOnlyList<string> OccasionedByTrendIds,
    string? RatifiedBy,
    string? RatifiedAt,
    string ValidFrom,
    string ValidTo,
    string MechanismLibraryVersion,
    string Sha256)
{
    /// <summary>Convenience for the required-field assertion: the provenance label rides on every response.</summary>
    public string ProvenanceLabel => Provenance.Label;
}

/// <summary>Evidence counts and the prevalence asymmetry. No magnitude, no 0-100 field.</summary>
public sealed record EvidenceView(
    int NExemplars,
    int NCreators,
    int NCohorts,
    int NTrends,
    decimal? PrevalenceInTopDecile,
    decimal? PrevalenceInContrastSet,
    decimal? PrevalenceRatio,
    string ContrastSetDefinition,
    IReadOnlyList<TemporalSliceView> TemporalSlices);

public sealed record TemporalSliceView(string From, string To, decimal? PrevalenceRatio);

public sealed record ProvenanceView(string CorpusSelection, string PredicateEvaluation, string Label);

/// <summary>The four coverage states. An empty collection never presents as an absence of structure (REQ-068).</summary>
public enum CoverageState
{
    Served,
    BelowWarrantBar,
    NoLibrary,
    CorpusStale,
}

/// <summary>
/// Why a collection response is shaped the way it is — served, below the warrant bar, no library, or a stale
/// corpus — with the blocking counts named. Also carries the P1/stale context when the store was degraded.
/// </summary>
public sealed record Coverage(
    string State,
    string? LibraryVersion,
    int MechanismsInLibrary,
    int Served,
    string Blocking,
    string? CorpusLastRefreshed,
    DateTimeOffset? StaleAsOf,
    string? Alarm);

/// <summary>A mechanisms collection response: the served mechanisms and the coverage that explains any emptiness.</summary>
public sealed record MechanismCollection(
    IReadOnlyList<MechanismView> Mechanisms,
    Coverage Coverage,
    string? LibraryVersion,
    string? Sha256);

/// <summary>
/// One served exemplar: a public post URI (or withheld) and a predicate-satisfaction boolean, with the
/// observation date. <strong>That is all (REQ-069).</strong> There is no creator handle, no frame, no
/// transcript, no face, no extracted personal information — a creator handle is neither a URI nor a boolean,
/// and it is creator identity on a served surface. The counts leave; the personal information does not.
/// </summary>
public sealed record ExemplarView(
    string? PublicPostUri,
    string ObservedAt,
    bool PredicateSatisfied,
    string UriStatus);

/// <summary>One warrant transition on a mechanism's history, with the corpus snapshot that caused it.</summary>
public sealed record WarrantTransitionView(
    string MechanismLibraryVersion,
    string Warrant,
    string CorpusSnapshotSha256,
    string PublishedAt);

/// <summary>A GET response with its HTTP status. Collections are always 200; a bare 500 is never produced.</summary>
public sealed record KnowledgeResponse<T>(int Status, T? Body, string? Reason)
{
    public static KnowledgeResponse<T> Ok(T body) => new(200, body, null);
    public static KnowledgeResponse<T> NotFound(string reason) => new(404, default, reason);
    public static KnowledgeResponse<T> Unavailable(string reason) => new(503, default, reason);
}
