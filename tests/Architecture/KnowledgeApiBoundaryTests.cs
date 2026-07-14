using System.Reflection;
using System.Xml.Linq;
using UgcIntelligence.Artefacts;
using UgcIntelligence.KnowledgeApi.Api;
using UgcIntelligence.KnowledgeApi.Resolution;
using UgcIntelligence.KnowledgeApi.Serving;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// A10, A11, A15, A18, A18b. C4's boundary is structural: no unratified path, no number, no PII, no write,
/// and one artefact-store prefix that cannot reach a pattern library.
/// </summary>
public sealed class KnowledgeApiBoundaryTests
{
    private static readonly Assembly C4 = typeof(KnowledgeApiEndpoints).Assembly;

    private static string RepoRoot()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !File.Exists(Path.Combine(d.FullName, "CLAUDE.md"))) d = d.Parent;
        return d?.FullName ?? throw new InvalidOperationException("repo root not found");
    }

    private static HashSet<string> DeclaredReferences(string assembly)
    {
        var csproj = Directory.GetFiles(Path.Combine(RepoRoot(), "src"), assembly + ".csproj", SearchOption.AllDirectories).Single();
        return [.. XDocument.Load(csproj).Descendants("ProjectReference")
            .Select(e => Path.GetFileNameWithoutExtension(e.Attribute("Include")!.Value.Replace('\\', '/')))];
    }

    /// <summary>A10. No handler exposes an include-unratified / admin / internal-exemption parameter.</summary>
    [Fact]
    public void C4_HasNoUnratifiedOrAdminBypass()
    {
        foreach (var method in typeof(KnowledgeApiEndpoints).GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
        {
            foreach (var p in method.GetParameters())
            {
                var n = p.Name!.ToLowerInvariant();
                Assert.False(n.Contains("unratified") || n.Contains("admin") || n.Contains("internal") || n.Contains("bypass"),
                    $"{method.Name}({p.Name}) looks like an exemption path. There is no ?include_unratified, no admin, no internal-caller exemption.");
            }
        }
    }

    /// <summary>
    /// A11. No served type carries a 0-100 score or an effect size. A <em>substring</em> scan, so a property
    /// named <c>LiftRatio</c> or <c>MyScore</c> is caught too. <c>prevalence_ratio</c> is a descriptive
    /// asymmetry and matches none of these fragments.
    /// </summary>
    [Theory]
    [InlineData(typeof(MechanismView))]
    [InlineData(typeof(EvidenceView))]
    [InlineData(typeof(ExemplarView))]
    [InlineData(typeof(Coverage))]
    public void C4_HasNoScoreField(Type view)
    {
        string[] forbidden = ["score", "lift", "aws", "vps", "bas", "effect", "spearman", "predicted"];
        foreach (var prop in view.GetProperties())
        {
            var n = prop.Name.ToLowerInvariant();
            foreach (var f in forbidden)
                Assert.False(n.Contains(f, StringComparison.Ordinal),
                    $"{view.Name}.{prop.Name} contains the forbidden magnitude fragment '{f}'. No 0-100 field, no effect size.");
        }
    }

    /// <summary>
    /// A15 / REQ-069. A served exemplar carries a URI + a predicate-satisfaction boolean (+ observation date)
    /// only — <strong>no creator identity and no extracted PII</strong>. A substring scan over the view's
    /// property names AND its serialized JSON, so a re-introduced <c>creator_handle</c> (or any frame /
    /// transcript / face / follower / avatar field) trips this guard.
    /// </summary>
    [Fact]
    public void C4_Exemplars_HaveNoPiiField()
    {
        string[] pii =
        [
            "frame", "transcript", "face", "onscreen", "features", "featurerecord", "audio", "image",
            "handle", "creator", "name", "bio", "follower", "avatar",
        ];

        foreach (var prop in typeof(ExemplarView).GetProperties())
        {
            var n = prop.Name.ToLowerInvariant();
            foreach (var p in pii)
                Assert.False(n.Contains(p, StringComparison.Ordinal),
                    $"ExemplarView.{prop.Name} contains the PII/identity fragment '{p}'. /exemplars serves URIs + booleans only (REQ-069).");
        }

        // The serialized wire shape carries none of them either.
        var json = System.Text.Json.JsonSerializer
            .Serialize(new ExemplarView("https://example.test/post", "2026-05-01", true, "resolvable"))
            .ToLowerInvariant();
        foreach (var p in pii)
            Assert.False(json.Contains(p, StringComparison.Ordinal),
                $"serialized ExemplarView contains the PII/identity fragment '{p}'.");
    }

    /// <summary>A18. C4 emits no events and reads no breaker: it references neither the event nor the breaker/contract assemblies.</summary>
    [Fact]
    public void C4_ReferencesNoEventOrBreakerAssembly()
    {
        var refs = DeclaredReferences("UgcIntelligence.KnowledgeApi");
        foreach (var forbidden in new[]
                 {
                     "UgcIntelligence.Events", "UgcIntelligence.Events.Writer",
                     "UgcIntelligence.Contracts",            // holds IBreakerReader / BreakerState
                     "UgcIntelligence.C2.Api", "UgcIntelligence.C3.Calibration",
                     "UgcIntelligence.Artefacts.Writer",     // the write/repoint capability
                 })
            Assert.DoesNotContain(forbidden, refs);
    }

    /// <summary>A18. C4 has no write path: no type in its assembly exposes a write/repoint/emit/delete method.</summary>
    [Fact]
    public void C4_ExposesNoWriteMethod()
    {
        string[] writeVerbs = ["Write", "Append", "Emit", "Repoint", "Delete", "Remove", "Publish", "Trip", "Arm", "Update", "Put", "Set", "SignOff"];
        foreach (var type in C4.GetTypes().Where(t => t.IsPublic))
        {
            var offenders = type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
                .Where(m => !m.IsSpecialName)
                .Select(m => m.Name)
                .Where(name => writeVerbs.Any(v => name.StartsWith(v, StringComparison.Ordinal)))
                .ToArray();
            Assert.True(offenders.Length == 0, $"{type.Name} exposes write-like method(s): {string.Join(", ", offenders)}. C4 is read-only end to end.");
        }
    }

    /// <summary>
    /// A18b. C4's read grant is one prefix, structurally. Its resolver holds a PrefixScopedReader granted the
    /// mechanism prefix, and an attempt to read the pattern prefix <strong>fails</strong> — it is not merely unattempted.
    /// </summary>
    [Fact]
    public void C4_CannotResolvePatternLibrary()
    {
        using var store = new Phase8Fixtures.Store();
        var reader = store.Reader;

        Assert.Equal(ArtefactStore.MechanismsPrefix, reader.GrantedPrefix);
        Assert.Throws<PrefixGrantViolationException>(() => reader.Reader.Read(ArtefactStore.PatternsPrefix, "anything"));
        Assert.Throws<PrefixGrantViolationException>(() => reader.Reader.ResolveActiveVersion(ArtefactStore.PatternsPrefix, "beauty.tiktok"));
    }

    /// <summary>C4_UnaffectedByOtherComponents. C4 reads an artefact store; it references none of C1/C2/C3.</summary>
    [Fact]
    public void C4_UnaffectedByOtherComponents()
    {
        var refs = DeclaredReferences("UgcIntelligence.KnowledgeApi");
        Assert.DoesNotContain("UgcIntelligence.C2.Api", refs);
        Assert.DoesNotContain("UgcIntelligence.C3.Calibration", refs);
        // Its whole read surface: Domain, the mechanism contract types, and the read-only artefact store.
        Assert.Contains("UgcIntelligence.Artefacts", refs);
        Assert.Contains("UgcIntelligence.Contracts.Mechanisms", refs);
    }

    /// <summary>C4_Down_NothingElseAffected. No control-plane component references C4, so C4 being down affects nothing.</summary>
    [Fact]
    public void C4_Down_NothingElseAffected()
    {
        foreach (var component in new[]
                 {
                     "UgcIntelligence.C2.Api", "UgcIntelligence.C3.Calibration",
                     "UgcIntelligence.Events", "UgcIntelligence.Artefacts",
                 })
            Assert.DoesNotContain("UgcIntelligence.KnowledgeApi", DeclaredReferences(component));
    }
}
