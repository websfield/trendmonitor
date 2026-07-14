using System.Reflection;
using System.Xml.Linq;
using UgcIntelligence.C3.Calibration.Breaker;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// P4-T9 (Rule 3, ADR-0005). <strong>C2 has no write path to breaker state.</strong> The trip/arm authority
/// (<see cref="IBreakerAuthority"/>) lives in C3's assembly and is unreachable from C2; C2 holds only
/// <see cref="IBreakerReader"/> from the shared contracts assembly. A breaker switchable from the component
/// it governs is a comment, so "C2 cannot write the breaker" is asserted as a <em>reachability</em> fact,
/// not a coding guideline — there is nothing in C2's process to call.
///
/// <para>The guarantee has three legs: (1) C2 does not reference C3 at all (declared build graph + emitted
/// metadata); (2) the write authority is placed in C3 and the read interface in shared Contracts, which is
/// what lets C2 read without reaching the referee; (3) no C2 type implements or exposes a breaker write.
/// The detector is self-checked by a canary — <c>AuthorityDetector_IsNotVacuous</c> — so the suite cannot
/// decay into one that certifies an absence. Falsifiable per verification step: adding a C2→C3 project
/// reference turns leg (1) red.</para>
/// </summary>
public sealed class BreakerAuthorityTests
{
    private const string C2 = "UgcIntelligence.C2.Api";
    private const string C3 = "UgcIntelligence.C3.Calibration";
    private const string ContractsAssembly = "UgcIntelligence.Contracts";

    private const BindingFlags AllMembers =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly;

    // ---- (1) reachability: C2 cannot reach C3, where the write authority lives --------------------

    [Fact]
    public void C2_DoesNotReference_C3Calibration()
    {
        Assert.DoesNotContain(C3, DeclaredReferences(C2));
        Assert.DoesNotContain(C3, EmittedReferences(C2));
    }

    // ---- (2) placement: write authority in C3, read interface in shared Contracts -----------------

    [Fact]
    public void BreakerAuthority_LivesInC3_AndTheReader_LivesInSharedContracts()
    {
        Assert.Equal(C3, typeof(IBreakerAuthority).Assembly.GetName().Name);
        Assert.Equal(ContractsAssembly, typeof(IBreakerReader).Assembly.GetName().Name);

        // The authority is NOT in the shared contracts assembly — if it were, C2 would reach it by reading
        // the contract, and the whole reachability argument would collapse.
        Assert.NotEqual(ContractsAssembly, typeof(IBreakerAuthority).Assembly.GetName().Name);
    }

    // ---- (3) C2 implements only the reader, never the authority; the cache is read-only -----------

    [Fact]
    public void NoC2Type_ImplementsTheBreakerAuthority()
    {
        var implementors = AuthorityImplementorsIn(Assembly.Load(C2)).ToList();
        Assert.Empty(implementors);
    }

    [Fact]
    public void C2BreakerCache_ImplementsReaderOnly_WithNoWriteMethod()
    {
        var cache = Assembly.Load(C2).GetType("UgcIntelligence.C2.Api.Breaker.BreakerCache")
            ?? throw new InvalidOperationException("BreakerCache not found in C2.Api");

        Assert.Contains(typeof(IBreakerReader), cache.GetInterfaces());
        Assert.False(typeof(IBreakerAuthority).IsAssignableFrom(cache),
            "BreakerCache must never implement the write authority — it reads and obeys.");

        var writeMethods = cache.GetMethods(AllMembers)
            .Where(m => m.Name is "TripAsync" or "ArmAsync" or "Trip" or "Arm")
            .ToList();
        Assert.Empty(writeMethods);
    }

    /// <summary>
    /// No config/admin/per-campaign override exists: no C2 method is a breaker write. The authority's verbs
    /// (<c>TripAsync</c>/<c>ArmAsync</c>) appear nowhere in C2, because there is no path in C2 to invoke them.
    /// </summary>
    [Fact]
    public void NoC2Method_WritesBreakerState()
    {
        var offenders = SafeTypes(Assembly.Load(C2))
            .SelectMany(t => t.GetMethods(AllMembers).Select(m => (Type: t, Method: m)))
            .Where(x => x.Method.Name is "TripAsync" or "ArmAsync")
            .Select(x => $"{x.Type.FullName}.{x.Method.Name}")
            .ToList();

        Assert.True(offenders.Count == 0,
            "Rule 3 VIOLATION: C2 exposes a breaker write method — there must be none:\n" + string.Join("\n", offenders));
    }

    // ---- (4) self-check: the authority detector actually detects an implementor -------------------

    [Fact]
    public void AuthorityDetector_IsNotVacuous()
    {
        // The same detector, aimed at the test assembly (which DOES contain an implementor), must find it.
        // If it cannot, the "no C2 type implements the authority" assertion above proves nothing.
        var inTests = AuthorityImplementorsIn(typeof(BreakerAuthorityTests).Assembly).ToList();
        Assert.Contains(typeof(AuthorityCanary), inTests);
    }

    private static IEnumerable<Type> AuthorityImplementorsIn(Assembly asm) =>
        SafeTypes(asm).Where(t => t.IsClass && typeof(IBreakerAuthority).IsAssignableFrom(t));

    /// <summary>A stand-in write authority — proves the detector is real, and stays isolated to the test assembly.</summary>
    private sealed class AuthorityCanary : IBreakerAuthority
    {
        public Task TripAsync(CohortKey cohort, string reason) => Task.CompletedTask;
        public Task ArmAsync(CohortKey cohort, Guid humanId, string recordedReason) => Task.CompletedTask;
    }

    private static IEnumerable<Type> SafeTypes(Assembly asm)
    {
        try { return asm.GetTypes(); }
        catch (ReflectionTypeLoadException ex) { return ex.Types.Where(t => t is not null)!; }
    }

    // ---- assembly reference graph (declared + emitted), self-contained -----------------------------

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

    private static HashSet<string> DeclaredReferences(string assembly, HashSet<string>? seen = null)
    {
        seen ??= new HashSet<string>(StringComparer.Ordinal);
        foreach (var include in XDocument.Load(CsprojFor(assembly)).Descendants("ProjectReference")
                                          .Select(e => e.Attribute("Include")?.Value)
                                          .OfType<string>())
        {
            var name = Path.GetFileNameWithoutExtension(include.Replace('\\', Path.DirectorySeparatorChar));
            if (seen.Add(name)) DeclaredReferences(name, seen);
        }
        return seen;
    }

    private static HashSet<string> EmittedReferences(string assembly) =>
        [.. Assembly.Load(assembly).GetReferencedAssemblies().Select(a => a.Name!)];
}
