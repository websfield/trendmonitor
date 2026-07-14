using System.Text.Json;
using System.Text.Json.Serialization;

namespace UgcIntelligence.Contracts.Mechanisms;

/// <summary>
/// Contract E warrant ladder. Only <see cref="Recurrent"/> and <see cref="Contrasted"/> are served as
/// active by C4; <see cref="Conjectured"/>/<see cref="Falsified"/>/<see cref="Retired"/> ship in the
/// artefact for audit and are never served as active. C4 does not compute or promote a warrant — it reads
/// a decision C1 made deterministically from corpus counts and a human ratified.
/// </summary>
public enum Warrant
{
    Conjectured,
    Recurrent,
    Contrasted,
    Falsified,
    Retired,
}

/// <summary>One ordered, non-overlapping temporal slice the prevalence ratio was measured on.</summary>
public sealed record TemporalSlice(string From, string To, decimal? PrevalenceRatio);

/// <summary>
/// A mechanism's evidence — counts, not magnitudes. <see cref="PrevalenceRatio"/> is a descriptive
/// asymmetry on a proxy-<em>selected</em> set (a ratio of two deterministic counts), never a lift or an
/// effect size. It is null when the contrast set is empty (ratio undefined, not infinite).
/// </summary>
public sealed record MechanismEvidence(
    int NExemplars,
    int NCreators,
    int NCohorts,
    int NTrends,
    decimal? PrevalenceInTopDecile,
    decimal? PrevalenceInContrastSet,
    decimal? PrevalenceRatio,
    string ContrastSetDefinition,
    IReadOnlyList<TemporalSlice> TemporalSlices);

/// <summary>
/// The provenance every mechanism carries: <c>Proxy-selected, Measured-evaluated</c>. Top-decile
/// membership came from a keyless (Proxy) read; the predicate was evaluated deterministically over the
/// FeatureRecord. No Proxy value is ever aggregated as Measured.
/// </summary>
public sealed record MechanismProvenance(string CorpusSelection, string PredicateEvaluation, string Label);

/// <summary>
/// A mechanism as read from a published <see cref="MechanismLibrary"/> artefact (mechanisms-v1.json,
/// Contract E). <strong>It carries no effect size and no magnitude field</strong> — the schema forbids
/// them via <c>additionalProperties: false</c>. <see cref="Statement"/> is model-drafted, human-ratified
/// prose; <see cref="FeaturePredicate"/> is the only machine-readable part, and C4 serves it verbatim
/// without evaluating it.
/// </summary>
public sealed record Mechanism(
    string Id,
    string Statement,
    JsonElement FeaturePredicate,
    string Falsifier,
    Warrant Warrant,
    MechanismEvidence Evidence,
    MechanismProvenance Provenance,
    string NeverTestedAgainst,
    string IngestionArm,
    string ValidFrom,
    string ValidTo,
    string? RatifiedBy = null,
    string? RatifiedAt = null,
    string? RatificationNote = null,
    string? SupersededBy = null,
    IReadOnlyList<string>? OccasionedByTrendIds = null)
{
    /// <summary>Ratified iff a named human ratified it with a non-empty note (REQ-065). No other path serves it.</summary>
    [JsonIgnore]
    public bool IsRatified =>
        !string.IsNullOrWhiteSpace(RatifiedBy)
        && !string.IsNullOrWhiteSpace(RatifiedAt)
        && !string.IsNullOrWhiteSpace(RatificationNote);
}

/// <summary>
/// An immutable, content-addressed mechanism library version (the library manifest). Its key
/// (<see cref="MechanismLibraryVersion"/>, e.g. <c>beauty.tiktok.m3</c>) carries <strong>no tenant
/// axis</strong>. C4 reads this from one artefact-store prefix and nothing else.
/// </summary>
public sealed record MechanismLibrary(
    string MechanismLibraryVersion,
    string Vertical,
    string Platform,
    string CutAt,
    string PublishedAt,
    IReadOnlyList<string> CompatibleExtractorVersions,
    string CorpusSnapshotSha256,
    IReadOnlyList<Mechanism> Mechanisms,
    string Sha256,
    string? Supersedes = null,
    string? ExemplarIndexUri = null)
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
    };

    /// <summary>Parse a manifest artefact's JSON. The <paramref name="sha256"/> is the verified content hash.</summary>
    public static MechanismLibrary Parse(string json)
    {
        var lib = JsonSerializer.Deserialize<MechanismLibrary>(json, Options)
            ?? throw new JsonException("mechanism library artefact deserialised to null");
        return lib;
    }
}
