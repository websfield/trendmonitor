using System.Text.Json;
using System.Text.Json.Serialization;
using UgcIntelligence.Artefacts;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;

namespace UgcIntelligence.C2.Api.Scoring;

// NOTE ON NAMING: the scoring plane forbids type names that read as a belief concept — "pattern",
// "mechanism", "trend", "warrant", "belief" (ScoringInputsForbiddenTests). The scorer resolves a *library*
// for anchoring, so these types use "library" terminology, exactly as CohortResolver does. The word
// "pattern" survives only in comments and in the on-the-wire string discriminator, never in a type name.

/// <summary>
/// The compatibility facts a resolved library artefact contributes to a score. It carries the library
/// version (for the pinned <see cref="VersionTriple"/>) and the compatible extractor versions
/// <see cref="CohortResolver.Resolve"/> checks the score's extractor against — and <strong>nothing
/// else</strong>. There is deliberately no effect size, no <c>Provenanced</c> value, and no
/// <c>MeasuredOutcome</c> on this type: this read path is a compatibility gate, not an estimation path.
/// Estimation reads the internal corpus only (Rule 5); the effect sizes carried inside the artefact's
/// <c>patterns[]</c> are never deserialised here.
/// </summary>
public sealed record ResolvedLibrary(string LibraryVersion, IReadOnlyList<string> CompatibleExtractorVersions);

/// <summary>
/// R4b-T3 (audit #3, reader-side). REQ-004/REQ-066. The production resolver that reads a library artefact
/// out of the content-addressed store and feeds <see cref="CohortResolver.Resolve"/> a non-null library, so
/// VPS can reach <c>Anchored</c> on a shipped, non-fixture code path — not only advisory.
///
/// <para><strong>Pattern keyspace only.</strong> The resolver is constructed with a
/// <see cref="PrefixScopedReader"/> that MUST be scoped to <see cref="ArtefactStore.PatternsPrefix"/>. A
/// reader scoped to <see cref="ArtefactStore.MechanismsPrefix"/> is rejected at construction. This is the
/// first of two defences that keep a mechanism library — which selects <c>Proxy</c>-provenance evidence and
/// is a hypothesis, never a number — out of VPS: the resolver cannot even name the mechanisms prefix. The
/// second is the <c>library_kind</c> discriminator checked on read.</para>
///
/// <para><strong>Fail closed.</strong> <see cref="ResolveCohort"/> degrades to advisory on a tampered
/// (sha-mismatch), missing, or unparseable artefact — never a fabricated <c>Anchored</c>, never a default
/// score. A wrong-kind artefact sitting under the patterns prefix is a store-integrity fault and is raised,
/// not silently swallowed.</para>
/// </summary>
public sealed class LibraryAnchorResolver
{
    /// <summary>The <c>library_kind</c> discriminator a pattern-library artefact must carry (Python writer side).</summary>
    public const string PatternLibraryKind = "pattern_library";

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
    };

    private readonly PrefixScopedReader _patterns;

    /// <param name="patternsReader">
    /// A store reader scoped to <see cref="ArtefactStore.PatternsPrefix"/>. Any other grant is a design
    /// error, not a permissions one: C2's library resolver reads the pattern keyspace and only that.
    /// </param>
    public LibraryAnchorResolver(PrefixScopedReader patternsReader)
    {
        ArgumentNullException.ThrowIfNull(patternsReader);
        if (!string.Equals(patternsReader.GrantedPrefix, ArtefactStore.PatternsPrefix, StringComparison.Ordinal))
            throw new LibraryResolverScopeException(patternsReader.GrantedPrefix);
        _patterns = patternsReader;
    }

    /// <summary>
    /// Read and validate a library artefact by its content hash. The store verifies the sha on read (a
    /// mismatch throws <see cref="ArtefactHashMismatchException"/>); this method additionally rejects
    /// anything whose <c>library_kind</c> is not <see cref="PatternLibraryKind"/> — a mechanism artefact
    /// accidentally addressed here never yields a pattern library.
    /// </summary>
    public ResolvedLibrary Resolve(string sha256)
    {
        var body = _patterns.Read(ArtefactStore.PatternsPrefix, sha256);   // prefix-scoped + sha verify-on-read

        LibraryArtefactBody? doc;
        try
        {
            doc = JsonSerializer.Deserialize<LibraryArtefactBody>(body, Options);
        }
        catch (JsonException ex)
        {
            throw new LibraryArtefactParseException(sha256, ex.Message);
        }

        if (doc is null)
            throw new LibraryArtefactParseException(sha256, "artefact body deserialised to null");

        if (!string.Equals(doc.LibraryKind, PatternLibraryKind, StringComparison.Ordinal))
            throw new WrongArtefactKindException(PatternLibraryKind, doc.LibraryKind ?? "(absent)");

        if (doc.CompatibleExtractorVersions is null || doc.CompatibleExtractorVersions.Count == 0)
            throw new LibraryArtefactParseException(sha256, "compatible_extractor_versions missing or empty");

        return new ResolvedLibrary(
            doc.LibraryVersion ?? "(unversioned)",
            doc.CompatibleExtractorVersions);
    }

    /// <summary>
    /// The scoring-path entry point: resolve the cohort's anchoring by reading the library and handing its
    /// compatible-extractor list to <see cref="CohortResolver.Resolve"/>. Any artefact-store failure —
    /// tampered content (P1 sha mismatch), a missing artefact, or an unparseable body — fails closed to a
    /// null library, i.e. an unanchored, advisory-only resolution. It never invents a library and never
    /// returns permission on a broken dependency (Rule 4).
    /// </summary>
    public CohortResolution ResolveCohort(VersionTriple scoreTriple, string librarySha, BreakerState? breakerRead)
    {
        IReadOnlyList<string>? compatible;
        try
        {
            compatible = Resolve(librarySha).CompatibleExtractorVersions;
        }
        catch (ArtefactHashMismatchException)   // P1: an immutable artefact was mutated. Refuse it → advisory.
        {
            compatible = null;
        }
        catch (ArtefactNotFoundException)        // missing library → advisory, never a default score.
        {
            compatible = null;
        }
        catch (LibraryArtefactParseException)    // writer/schema drift → advisory, never a default score.
        {
            compatible = null;
        }

        return CohortResolver.Resolve(scoreTriple, compatible, breakerRead);
    }

    /// <summary>
    /// The minimal read shape. It names exactly the three fields the compatibility gate needs. It carries
    /// no <c>patterns[]</c>, no <c>effect_size</c>, no provenance-typed member — so no <c>Proxy</c>-selected
    /// number can travel this read path into VPS. What is not deserialised cannot be surfaced.
    /// </summary>
    private sealed record LibraryArtefactBody
    {
        [JsonPropertyName("library_kind")] public string? LibraryKind { get; init; }
        [JsonPropertyName("pattern_library_version")] public string? LibraryVersion { get; init; }
        [JsonPropertyName("compatible_extractor_versions")] public IReadOnlyList<string>? CompatibleExtractorVersions { get; init; }
    }
}

/// <summary>The resolver was handed a store grant other than the pattern keyspace. A design error, not a permissions one.</summary>
public sealed class LibraryResolverScopeException(string grantedPrefix)
    : InvalidOperationException(
        $"C2's library resolver must be scoped to the '{ArtefactStore.PatternsPrefix}' prefix; it was handed a " +
        $"'{grantedPrefix}' grant. Resolving from any other keyspace — a mechanism library above all — would let " +
        "Proxy-selected, non-numeric hypotheses reach VPS (Rule 5 / REQ-066).");

/// <summary>
/// A non-pattern artefact was addressed through the library resolver. The second defence behind prefix
/// scoping: even an artefact sitting under the patterns prefix is refused unless its <c>library_kind</c>
/// says it is a pattern library. A mechanism library never becomes a pattern library.
/// </summary>
public sealed class WrongArtefactKindException(string expectedKind, string actualKind)
    : InvalidOperationException(
        $"Refusing artefact: expected library_kind '{expectedKind}' but found '{actualKind}'. A mechanism " +
        "library carries Proxy-provenance evidence and makes no numeric prediction; it must never resolve as a " +
        "pattern library or reach VPS.");

/// <summary>The artefact body did not parse as a pattern library. Fails closed to advisory (Rule 4).</summary>
public sealed class LibraryArtefactParseException(string sha256, string detail)
    : InvalidOperationException($"Library artefact {sha256} could not be read as a pattern library: {detail}.");
