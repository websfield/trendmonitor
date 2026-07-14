using System.Reflection;
using System.Xml.Linq;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// The one-way call-graph, asserted as a property of what is <em>reachable</em> from each assembly.
///
/// <para>ADR-0007 is explicit that the invariant must be reachability, not a filter:
/// <em>"a bug in C4's tenancy check cannot leak a tenant's data, because there is none in the process."</em>
/// A boundary enforced by code review is one convenient refactor from gone.</para>
///
/// <para><strong>Why this reads .csproj files and not <c>Assembly.GetReferencedAssemblies()</c>.</strong>
/// Roslyn elides a project reference whose types are never used, so metadata inspection reports a
/// forbidden reference as absent right up until someone writes the line of code that uses it — by
/// which point the boundary is already broken. The declared build graph is the ground truth, and it
/// is what a developer edits when they reach for the convenience. We assert on both: the declaration
/// (primary) and the emitted metadata (defence in depth).</para>
/// </summary>
public sealed class ReferenceGraphTests
{
    private static string RepoRoot()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !File.Exists(Path.Combine(d.FullName, "CLAUDE.md"))) d = d.Parent;
        return d?.FullName ?? throw new InvalidOperationException("repo root not found");
    }

    private static string CsprojFor(string assembly)
    {
        var matches = Directory.GetFiles(Path.Combine(RepoRoot(), "src"), assembly + ".csproj", SearchOption.AllDirectories);
        return matches.Length == 1
            ? matches[0]
            : throw new InvalidOperationException($"expected exactly one {assembly}.csproj, found {matches.Length}");
    }

    /// <summary>The DECLARED build graph: every &lt;ProjectReference&gt; in the csproj, transitively resolved.</summary>
    private static HashSet<string> DeclaredReferences(string assembly, HashSet<string>? seen = null)
    {
        seen ??= new HashSet<string>(StringComparer.Ordinal);
        var csproj = CsprojFor(assembly);
        var dir = Path.GetDirectoryName(csproj)!;

        foreach (var include in XDocument.Load(csproj).Descendants("ProjectReference")
                                          .Select(e => e.Attribute("Include")?.Value)
                                          .OfType<string>())
        {
            var name = Path.GetFileNameWithoutExtension(include.Replace('\\', Path.DirectorySeparatorChar));
            if (seen.Add(name)) DeclaredReferences(name, seen);
        }
        return seen;
    }

    /// <summary>The EMITTED metadata: what the compiler actually kept. Catches a reference added via a NuGet or a using.</summary>
    private static HashSet<string> EmittedReferences(string assembly) =>
        [.. Assembly.Load(assembly).GetReferencedAssemblies().Select(a => a.Name!)];

    private static void AssertUnreachable(string from, string forbidden, string why)
    {
        Assert.False(DeclaredReferences(from).Contains(forbidden),
            $"BOUNDARY VIOLATION (declared): {from}.csproj references {forbidden}.\n{why}");

        Assert.False(EmittedReferences(from).Contains(forbidden),
            $"BOUNDARY VIOLATION (emitted): {from} binds {forbidden} at runtime.\n{why}");
    }

    // ---- (a) C2 never calls C1, and never calls C4 -------------------------------------------

    [Fact]
    public void C2_DoesNotReference_KnowledgeApi() =>
        AssertUnreachable("UgcIntelligence.C2.Api", "UgcIntelligence.KnowledgeApi",
            "C2 never calls C4 (ADR-0007). A scoring path that reads a mechanism has laundered " +
            "Proxy-selected evidence into a client-facing number, and made a VPS irreproducible " +
            "from its pinned version triple.");

    [Fact]
    public void C2_CannotSeeAMechanismType() =>
        AssertUnreachable("UgcIntelligence.C2.Api", "UgcIntelligence.Contracts.Mechanisms",
            "REQ-066: no Mechanism, and nothing derived from one, is an input to a veto, a verdict, " +
            "a VPS, a BAS, an AWS term, or a budget allocation. The rule is enforceable only because " +
            "C2 has no path to one.");

    [Fact]
    public void C2_DoesNotReference_C3() =>
        AssertUnreachable("UgcIntelligence.C2.Api", "UgcIntelligence.C3.Calibration",
            "C2's only read path to C3 is Contract C, the breaker flag. There is no configuration in " +
            "C2 that overrides a breaker. A breaker that can be switched off from the component it " +
            "governs is a comment.");

    // ---- (b) C4 calls nothing ------------------------------------------------------------------

    [Theory]
    [InlineData("UgcIntelligence.C2.Api")]
    [InlineData("UgcIntelligence.C3.Calibration")]
    [InlineData("UgcIntelligence.Events")]
    [InlineData("UgcIntelligence.Events.Writer")]
    [InlineData("UgcIntelligence.Contracts")]
    public void C4_DoesNotReference(string forbidden) =>
        AssertUnreachable("UgcIntelligence.KnowledgeApi", forbidden,
            "C4 calls nothing and writes nothing. It reads one artefact-store prefix. It emits no " +
            "events (Contract B has exactly one writer and it is C2) and reads no breaker. This is " +
            "the entire reason a knowledge surface can be exposed outside ClientHub.");

    // ---- (c) C3 calls nothing ------------------------------------------------------------------

    [Theory]
    [InlineData("UgcIntelligence.C2.Api")]
    [InlineData("UgcIntelligence.KnowledgeApi")]
    [InlineData("UgcIntelligence.Contracts.Mechanisms")]
    public void C3_DoesNotReference(string forbidden) =>
        AssertUnreachable("UgcIntelligence.C3.Calibration", forbidden,
            "ADR-0005: C3 consumes the event log and writes one flag and one verdict. It calls nothing. " +
            "A mechanism makes no numeric prediction and touches no outcome data, so there is nothing " +
            "for a calibration referee to referee.");

    // ---- (d) IOutcomeEventWriter is reachable from C2 only --------------------------------------

    [Theory]
    [InlineData("UgcIntelligence.C3.Calibration")]
    [InlineData("UgcIntelligence.KnowledgeApi")]
    [InlineData("UgcIntelligence.Artefacts")]
    public void SoleEventWriter_IsUnreachableFrom(string component) =>
        AssertUnreachable(component, "UgcIntelligence.Events.Writer",
            "Contract B has exactly one writer and it is C2. C1 and C3 consume the log; neither writes " +
            "to it. If C1 needed to tell C2 something, the design is wrong.");

    // ---- (d2) the artefact write + promotion capability is reachable from no C# component -------

    /// <summary>
    /// Repointing <c>active_version</c> IS the promotion authority. C1 (Python) is the only writer
    /// of either published artefact. No C# component may hold the capability — least of all C4,
    /// whose entire safety argument is that there is nothing in its process to leak or to break.
    /// </summary>
    [Theory]
    [InlineData("UgcIntelligence.C2.Api")]
    [InlineData("UgcIntelligence.C3.Calibration")]
    [InlineData("UgcIntelligence.KnowledgeApi")]
    public void ArtefactWriter_IsUnreachableFrom(string component) =>
        AssertUnreachable(component, "UgcIntelligence.Artefacts.Writer",
            "C2 and C4 read artefacts through a PrefixScopedReader: one prefix, read-only, no repoint. " +
            "A component that can repoint active_version can promote its way out of an unfavourable " +
            "calibration reading (ADR-0005) or publish over a ratified mechanism library (ADR-0007).");

    [Fact]
    public void ArtefactWrite_IsGrantedToExactlyOneProductionAssembly()
    {
        var grants = Assembly.Load("UgcIntelligence.Artefacts")
            .GetCustomAttributes<System.Runtime.CompilerServices.InternalsVisibleToAttribute>()
            .Select(a => a.AssemblyName)
            .Where(n => !n.Contains("Tests", StringComparison.Ordinal))
            .ToArray();

        Assert.Equal(["UgcIntelligence.Artefacts.Writer"], grants);
    }

    [Fact]
    public void C2_IsTheOnlyComponentThatReferencesTheWriter()
    {
        string[] components =
        [
            "UgcIntelligence.C2.Api", "UgcIntelligence.C3.Calibration", "UgcIntelligence.KnowledgeApi",
            "UgcIntelligence.Domain", "UgcIntelligence.Contracts", "UgcIntelligence.Contracts.Mechanisms",
            "UgcIntelligence.Artefacts", "UgcIntelligence.Events",
        ];

        var writers = components.Where(c => DeclaredReferences(c).Contains("UgcIntelligence.Events.Writer")).ToArray();
        Assert.Equal(["UgcIntelligence.C2.Api"], writers);
    }

    /// <summary>The <c>internal</c> Append method is granted to exactly one production assembly.</summary>
    [Fact]
    public void SoleEventWriter_IsGrantedToExactlyOneProductionAssembly()
    {
        var grants = Assembly.Load("UgcIntelligence.Events")
            .GetCustomAttributes<System.Runtime.CompilerServices.InternalsVisibleToAttribute>()
            .Select(a => a.AssemblyName)
            .Where(n => !n.Contains("Tests", StringComparison.Ordinal))
            .ToArray();

        Assert.Equal(["UgcIntelligence.Events.Writer"], grants);
    }

    // ---- (e) no C2 type reaches C1 (the C#->Python edge a ProjectReference test cannot see) -----

    [Fact]
    public void C2_HoldsNoHttpClientOrSubprocess()
    {
        // The intelligence plane is a batch process reached through the event log and the artefact
        // store, never through a request-time call. "A system where a score depends on a pattern mined
        // from scores is a system with feedback inside a request."
        string[] forbidden = ["System.Net.Http", "System.Diagnostics.Process"];

        foreach (var t in Assembly.Load("UgcIntelligence.C2.Api").GetTypes())
        {
            var members = t.GetFields(BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static)
                           .Select(f => (f.Name, Type: f.FieldType))
                           .Concat(t.GetProperties(BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static)
                                    .Select(p => (p.Name, Type: p.PropertyType)));

            foreach (var (name, type) in members)
                Assert.False(forbidden.Any(x => type.FullName?.StartsWith(x, StringComparison.Ordinal) == true),
                    $"BOUNDARY VIOLATION: {t.Name}.{name} is a {type.Name}. There is no code path from a " +
                    "scoring request into the Pattern Engine.");
        }
    }

    // ---- (f) HOST SEPARATION (ADR-0007 §6, phase R4a) ------------------------------------------------
    //
    // The tests above prove the *assemblies* don't cross-reference. ADR-0007 §6 asserts a stronger, runtime
    // property: C2/C3/C4 each run as a separate host project — a distinct executable/process — and each
    // host's composition root holds only its own grants. Two assemblies that never reference each other can
    // still be co-hosted by a composition root that references both; these tests assert the grants at the
    // host level, where the composition actually happens. Residual DR5 (a *future* single-process root that
    // references two host assemblies) is out of scope here and tracked in the plan's Deferral Ledger.

    private const string C2Host = "UgcIntelligence.C2.Host";
    private const string C3Host = "UgcIntelligence.C3.Host";
    private const string C4Host = "UgcIntelligence.KnowledgeApi.Host";

    /// <summary>
    /// Host separation is asserted on the DECLARED build graph only. The host projects are executables the
    /// test assembly does not reference, so their dlls are not loaded into this process — the csproj graph
    /// (transitively resolved) is the ground truth, and it is what a developer edits to reach a forbidden type.
    /// </summary>
    private static void AssertHostDoesNotReference(string host, string forbidden, string why) =>
        Assert.False(DeclaredReferences(host).Contains(forbidden),
            $"HOST-SEPARATION VIOLATION (declared): {host}.csproj transitively references {forbidden}.\n{why}");

    /// <summary>The IMMEDIATE ProjectReferences of a host — its own composition-root grants, not transitive.</summary>
    private static HashSet<string> DirectReferences(string assembly) =>
        [.. XDocument.Load(CsprojFor(assembly)).Descendants("ProjectReference")
            .Select(e => e.Attribute("Include")?.Value)
            .OfType<string>()
            .Select(v => Path.GetFileNameWithoutExtension(v.Replace('\\', Path.DirectorySeparatorChar)))];

    [Fact]
    public void HostProjects_AreThreeDistinctExecutables()
    {
        var csprojs = new[] { C2Host, C3Host, C4Host }.Select(CsprojFor).ToArray();   // throws if missing/ambiguous
        Assert.All(csprojs, p => Assert.True(File.Exists(p)));
        Assert.Equal(3, csprojs.Distinct(StringComparer.OrdinalIgnoreCase).Count());

        // Each is a Web SDK host (an executable), not a class library.
        Assert.All(csprojs, p => Assert.Equal("Microsoft.NET.Sdk.Web",
            XDocument.Load(p).Root!.Attribute("Sdk")!.Value));
    }

    // C2's host references neither C1 (its C# proxy, a Mechanism type) nor C4, nor the referee's assembly.
    [Theory]
    [InlineData("UgcIntelligence.KnowledgeApi")]
    [InlineData("UgcIntelligence.Contracts.Mechanisms")]
    [InlineData("UgcIntelligence.C3.Calibration")]
    public void C2Host_DoesNotReference(string forbidden) =>
        AssertHostDoesNotReference(C2Host, forbidden,
            "C2's host is the scorer's process. It never calls C4 and holds no Mechanism type (ADR-0007): a " +
            "scoring path with a mechanism in its address space has laundered Proxy-selected evidence into a " +
            "client-facing number. Its only breaker link is Contract C, never C3's assembly.");

    // C3's host is a reader/authority: no write grant, no C1/C2/C4.
    [Theory]
    [InlineData("UgcIntelligence.Events.Writer")]
    [InlineData("UgcIntelligence.C2.Api")]
    [InlineData("UgcIntelligence.KnowledgeApi")]
    [InlineData("UgcIntelligence.Contracts.Mechanisms")]
    public void C3Host_DoesNotReference(string forbidden) =>
        AssertHostDoesNotReference(C3Host, forbidden,
            "C3's host consumes the event log through IOutcomeEventReader and is the sole breaker/library " +
            "authority; it references neither the event Writer (Contract B has exactly one writer and it is " +
            "C2) nor any C1 knowledge type. A referee that can write the log it referees is not a referee.");

    [Fact]
    public void C3Host_IsReaderOnlyOverTheEventLog()
    {
        var refs = DeclaredReferences(C3Host);
        Assert.Contains("UgcIntelligence.Events", refs);              // it consumes the log (reader side)
        Assert.DoesNotContain("UgcIntelligence.Events.Writer", refs); // but holds no write capability
    }

    // C4's host references no event log and no breaker, and no C1/C2/C3.
    [Theory]
    [InlineData("UgcIntelligence.Events")]
    [InlineData("UgcIntelligence.Events.Writer")]
    [InlineData("UgcIntelligence.Contracts")]      // IBreakerReader / BreakerReading live here — C4 reads no breaker
    [InlineData("UgcIntelligence.C2.Api")]
    [InlineData("UgcIntelligence.C3.Calibration")]
    public void C4Host_DoesNotReference(string forbidden) =>
        AssertHostDoesNotReference(C4Host, forbidden,
            "C4's host writes nothing, emits no events, and reads no breaker (ADR-0007 §1/§3). It does not " +
            "share a process with C1. Its whole read grant is one artefact-store prefix — a second data " +
            "source would be a design error, not a permissions one.");

    [Fact]
    public void C4Host_ReadGrantIsExactlyKnowledgeApiAndTheArtefactStore() =>
        Assert.Equal(
            new SortedSet<string>(StringComparer.Ordinal) { "UgcIntelligence.Artefacts", "UgcIntelligence.KnowledgeApi" },
            new SortedSet<string>(DirectReferences(C4Host), StringComparer.Ordinal));

    [Fact]
    public void SoleEventWriterHost_IsC2HostAlone()
    {
        // Contract B's sole-writer invariant, asserted at the host level: the write grant lives in exactly
        // one running process, and it is C2's.
        Assert.Contains("UgcIntelligence.Events.Writer", DeclaredReferences(C2Host));
        Assert.DoesNotContain("UgcIntelligence.Events.Writer", DeclaredReferences(C3Host));
        Assert.DoesNotContain("UgcIntelligence.Events.Writer", DeclaredReferences(C4Host));
    }
}

/// <summary>
/// The test above must be able to fail. This asserts the mechanism it relies on actually detects a
/// forbidden edge, using a synthetic csproj — so a future refactor cannot silently turn the whole
/// reference-graph suite into a no-op that certifies an absence.
/// </summary>
public sealed class ReferenceGraphTestsCanFail
{
    [Fact]
    public void ADeclaredProjectReference_IsDetected()
    {
        var dir = Directory.CreateTempSubdirectory("ugc-refgraph-");
        try
        {
            var csproj = Path.Combine(dir.FullName, "Fake.csproj");
            File.WriteAllText(csproj, """
                <Project Sdk="Microsoft.NET.Sdk">
                  <ItemGroup>
                    <ProjectReference Include="..\Forbidden\UgcIntelligence.KnowledgeApi.csproj" />
                  </ItemGroup>
                </Project>
                """);

            var referenced = XDocument.Load(csproj).Descendants("ProjectReference")
                .Select(e => Path.GetFileNameWithoutExtension(e.Attribute("Include")!.Value.Replace('\\', '/')))
                .ToArray();

            // If this ever stops seeing the reference, every boundary test above is vacuous.
            Assert.Contains("UgcIntelligence.KnowledgeApi", referenced);
        }
        finally { dir.Delete(recursive: true); }
    }
}
