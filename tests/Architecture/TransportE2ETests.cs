using System.Text.Json;
using UgcIntelligence.Artefacts;
using UgcIntelligence.C2.Api.Scoring;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// R4b-T5 (audit #3). The real cross-process transport, end-to-end, starting from Python's <em>actual</em>
/// serialized output — the committed fixture under <c>tests/Architecture/fixtures/transport</c>, produced by
/// C1's real artefact writer — not a hand-built C# fixture.
///
/// <list type="bullet">
/// <item>A-R4b-1: a Python-written artefact lands at <c>&lt;prefix&gt;/&lt;sha[0:2]&gt;/&lt;sha&gt;.json</c>
/// and C# <see cref="ArtefactStore"/> reads it.</item>
/// <item>A-R4b-2: VPS reaches <c>Anchored</c> on this non-fixture read path, driven by the real transport.</item>
/// <item>A-R4b-4: a one-byte corruption of a <em>copy</em> makes the C# read refuse on sha mismatch and VPS
/// fall back to advisory (fail closed). The committed fixture is never touched.</item>
/// </list>
/// </summary>
public sealed class TransportE2ETests
{
    // The score triple whose extractor 3.2.0 satisfies the library's ["3.2.x"] → IsCompatibleWith true.
    private static VersionTriple CompatibleTriple(TransportManifest m) =>
        new("3.2.0", "1.1.0", m.PatternLibraryVersion);

    [Fact]
    public void PythonWrittenArtefact_ReadThroughArtefactStore_YieldsTheLibrary()   // A-R4b-1
    {
        var root = TransportFixture.Root();
        var manifest = TransportFixture.Manifest();

        var resolver = new LibraryAnchorResolver(ArtefactStore.OpenPrefix(root, ArtefactStore.PatternsPrefix));
        var library = resolver.Resolve(manifest.Sha256);

        Assert.Equal("beauty.tiktok.v7", library.LibraryVersion);
        Assert.Equal(manifest.PatternLibraryVersion, library.LibraryVersion);
        Assert.Equal(manifest.CompatibleExtractorVersions, library.CompatibleExtractorVersions);
    }

    [Fact]
    public void RealTransport_DrivesVpsToAnchored_WhenExtractorCompatibleAndBreakerArmed()   // A-R4b-2
    {
        var root = TransportFixture.Root();
        var manifest = TransportFixture.Manifest();
        var resolver = new LibraryAnchorResolver(ArtefactStore.OpenPrefix(root, ArtefactStore.PatternsPrefix));

        var resolution = resolver.ResolveCohort(CompatibleTriple(manifest), manifest.Sha256, BreakerState.Armed);

        Assert.True(resolution.Anchored);              // anchored against the real Python-written library
        Assert.False(resolution.Advisory);             // armed breaker → surfaced, not advisory
        Assert.Equal(BreakerState.Armed, resolution.State);
        Assert.Null(resolution.Alert);
    }

    [Fact]
    public void Anchored_ButAdvisory_WhenBreakerColdOrUnreachable()
    {
        var root = TransportFixture.Root();
        var manifest = TransportFixture.Manifest();
        var resolver = new LibraryAnchorResolver(ArtefactStore.OpenPrefix(root, ArtefactStore.PatternsPrefix));

        // A cold breaker: anchored (library resolved, extractor compatible) but VPS stays advisory.
        var cold = resolver.ResolveCohort(CompatibleTriple(manifest), manifest.Sha256, BreakerState.Cold);
        Assert.True(cold.Anchored);
        Assert.True(cold.Advisory);

        // A null (unreachable/stale) breaker reading fails closed to cold — still advisory, never permission.
        var unreachable = resolver.ResolveCohort(CompatibleTriple(manifest), manifest.Sha256, breakerRead: null);
        Assert.True(unreachable.Anchored);
        Assert.True(unreachable.Advisory);
        Assert.Equal(BreakerState.Cold, unreachable.State);
    }

    [Fact]
    public void IncompatibleExtractor_FailsClosedToAdvisory_NeverAnchored()
    {
        var root = TransportFixture.Root();
        var manifest = TransportFixture.Manifest();
        var resolver = new LibraryAnchorResolver(ArtefactStore.OpenPrefix(root, ArtefactStore.PatternsPrefix));

        // A library mined over extractor 3.2 features cannot score a FeatureRecord produced by extractor 4.0.
        var incompatible = new VersionTriple("4.0.0", "1.1.0", manifest.PatternLibraryVersion);
        var resolution = resolver.ResolveCohort(incompatible, manifest.Sha256, BreakerState.Armed);

        Assert.False(resolution.Anchored);
        Assert.True(resolution.Advisory);
        Assert.Contains("version_triple_mismatch", resolution.Alert);
    }

    [Fact]
    public void ShaMismatch_C2ReadRefuses_AndVpsFallsBackToAdvisory()   // A-R4b-4 (falsification)
    {
        var manifest = TransportFixture.Manifest();

        // Copy the fixture artefact into a temp store and corrupt exactly one byte. The committed fixture is
        // never mutated.
        var tempRoot = Directory.CreateTempSubdirectory("ugc-transport-tamper-").FullName;
        try
        {
            var rel = Path.Combine(ArtefactStore.PatternsPrefix, manifest.Sha256[..2], manifest.Sha256 + ".json");
            var src = Path.Combine(TransportFixture.Root(), rel);
            var dst = Path.Combine(tempRoot, rel);
            Directory.CreateDirectory(Path.GetDirectoryName(dst)!);

            var bytes = File.ReadAllBytes(src);
            bytes[bytes.Length / 2] ^= 0x01;   // flip one bit: content no longer hashes to its filename
            File.WriteAllBytes(dst, bytes);

            var resolver = new LibraryAnchorResolver(ArtefactStore.OpenPrefix(tempRoot, ArtefactStore.PatternsPrefix));

            // The store refuses the mutated artefact on read (P1).
            var refusal = Assert.Throws<ArtefactHashMismatchException>(() => resolver.Resolve(manifest.Sha256));
            Assert.Contains("P1", refusal.Message);

            // The scoring path fails closed: no fabricated Anchored, advisory instead.
            var resolution = resolver.ResolveCohort(CompatibleTriple(manifest), manifest.Sha256, BreakerState.Armed);
            Assert.False(resolution.Anchored);
            Assert.True(resolution.Advisory);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }
}

/// <summary>The committed R4b transport fixture: Python's real serialized output plus its manifest.</summary>
internal sealed record TransportManifest(
    string Sha256,
    string PatternLibraryVersion,
    IReadOnlyList<string> CompatibleExtractorVersions);

internal static class TransportFixture
{
    private static readonly JsonSerializerOptions ManifestOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
    };

    public static string Root()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !File.Exists(Path.Combine(d.FullName, "CLAUDE.md"))) d = d.Parent;
        var repo = d?.FullName ?? throw new InvalidOperationException("repo root not found");
        return Path.Combine(repo, "tests", "Architecture", "fixtures", "transport");
    }

    public static TransportManifest Manifest()
    {
        var json = File.ReadAllText(Path.Combine(Root(), "manifest.json"));
        return JsonSerializer.Deserialize<TransportManifest>(json, ManifestOptions)
               ?? throw new InvalidOperationException("transport manifest.json did not deserialise");
    }
}
