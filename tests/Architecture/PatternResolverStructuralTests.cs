using System.Reflection;
using UgcIntelligence.Artefacts;
using UgcIntelligence.Artefacts.Writer;
using UgcIntelligence.C2.Api.Scoring;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// R4b-T6, A-R4b-5. Structural guarantees on C2's new library read path, proven by construction/type — not
/// left to reviewer attestation:
/// <list type="number">
/// <item>C2's library resolver cannot load a mechanism artefact — two defences: prefix scoping (it cannot
/// name the mechanisms keyspace) and a <c>library_kind</c> discriminator (it refuses a mechanism body even
/// if one is addressed under the patterns prefix).</item>
/// <item>No <c>Proxy</c>-provenance value — indeed no provenance-typed value and no effect size — can reach
/// VPS through this read path: the read-path types expose none.</item>
/// </list>
/// </summary>
public sealed class PatternResolverStructuralTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("ugc-resolver-").FullName;
    private ArtefactWriter Writer => new(_root);
    public void Dispose() => Directory.Delete(_root, recursive: true);

    // ---- (a) the resolver cannot load a mechanism artefact ----------------------------------------

    [Fact]
    public void Resolver_CannotBeScopedToTheMechanismsKeyspace()
    {
        // A reader granted the mechanisms prefix is refused at construction: the resolver reads patterns, and
        // only patterns. A mechanism library — Proxy-provenance, non-numeric hypotheses — has no path in.
        var mechanismReader = ArtefactStore.OpenPrefix(_root, ArtefactStore.MechanismsPrefix);
        Assert.Throws<LibraryResolverScopeException>(() => new LibraryAnchorResolver(mechanismReader));
    }

    [Fact]
    public void Resolver_CannotSeeAMechanismArtefactWrittenToTheMechanismsPrefix()
    {
        // Prefix scoping: a mechanism artefact lives under the mechanisms keyspace, which the patterns-scoped
        // resolver cannot address — the read simply does not find it.
        var mechSha = Writer.Write(ArtefactStore.MechanismsPrefix,
            """{"library_kind":"mechanism_library","mechanism_library_version":"beauty.tiktok.m3"}""");

        var resolver = new LibraryAnchorResolver(ArtefactStore.OpenPrefix(_root, ArtefactStore.PatternsPrefix));
        Assert.Throws<ArtefactNotFoundException>(() => resolver.Resolve(mechSha));
    }

    [Fact]
    public void Resolver_RejectsAMechanismBodyEvenUnderThePatternsPrefix()
    {
        // Second defence: even if a mechanism-kind body is content-addressed under the patterns prefix, the
        // library_kind discriminator refuses it. A mechanism library never resolves as a pattern library.
        var poisoned = Writer.Write(ArtefactStore.PatternsPrefix,
            """{"library_kind":"mechanism_library","compatible_extractor_versions":["3.2.x"]}""");

        var resolver = new LibraryAnchorResolver(ArtefactStore.OpenPrefix(_root, ArtefactStore.PatternsPrefix));
        var ex = Assert.Throws<WrongArtefactKindException>(() => resolver.Resolve(poisoned));
        Assert.Contains("mechanism_library", ex.Message);
    }

    // ---- (b) no Proxy/provenance/effect-size type can reach VPS via this read path ------------------

    /// <summary>
    /// The read-path types name no type from <c>UgcIntelligence.Domain.Provenance</c> and no effect-size-
    /// shaped member anywhere in their signatures. The reflected set includes <c>LibraryArtefactBody</c>,
    /// the private DTO that <em>actually deserializes the artefact</em> — so a future edit that added an
    /// <c>effect_size</c> or provenance-typed member to it (which System.Text.Json would then bind) is
    /// caught here, not silently admitted. What is not deserialised cannot be surfaced; estimation reads
    /// the internal corpus only (Rule 5). Two failure vectors are both covered: a provenance/effect
    /// <em>type</em> (member type check) and a same-named <em>member</em> such as <c>decimal EffectSize</c>
    /// (member-name check).
    /// </summary>
    [Fact]
    public void ReadPathTypes_ExposeNoProvenanceOrEffectSizeType()
    {
        // The real deserialization DTO is a private nested type; reach it by reflection so the guard covers
        // the type STJ actually binds the artefact into. Failing loudly if it is renamed keeps the guard honest.
        var artefactBody = typeof(LibraryAnchorResolver).GetNestedType("LibraryArtefactBody", BindingFlags.NonPublic)
            ?? throw new InvalidOperationException(
                "LibraryArtefactBody nested DTO not found — the effect-size structural fence would be a no-op.");

        Type[] readPath = [typeof(ResolvedLibrary), typeof(LibraryAnchorResolver), artefactBody];

        foreach (var owner in readPath)
        {
            // (i) member TYPES: no provenance/proxy/measured-outcome type crosses the boundary.
            foreach (var referenced in SignatureTypes(owner))
            {
                Assert.NotEqual("UgcIntelligence.Domain.Provenance", referenced.Namespace);
                Assert.DoesNotContain("Proxy", referenced.Name, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("Provenanced", referenced.Name, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("MeasuredOutcome", referenced.Name, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("EffectSize", referenced.Name, StringComparison.OrdinalIgnoreCase);
            }

            // (ii) member NAMES: no effect-size/provenance-shaped member, even one typed as a bare number.
            foreach (var name in MemberNames(owner))
            {
                Assert.DoesNotContain("effect", name, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("proxy", name, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("provenance", name, StringComparison.OrdinalIgnoreCase);
            }
        }
    }

    /// <summary>The declared field and property names of <paramref name="t"/> (a bare-number member is invisible to a type scan).</summary>
    private static IEnumerable<string> MemberNames(Type t) =>
        t.GetFields(AllMembers).Where(f => !f.IsSpecialName).Select(f => f.Name)
            .Concat(t.GetProperties(AllMembers).Select(p => p.Name));

    /// <summary>
    /// The resolved library carries only the two compatibility facts the gate needs: a version string and a
    /// list of extractor-version strings. No number, no provenance, no effect size travels this boundary.
    /// </summary>
    [Fact]
    public void ResolvedLibrary_CarriesOnlyStringsAndAVersion()
    {
        var props = typeof(ResolvedLibrary)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.DeclaringType == typeof(ResolvedLibrary))
            .ToArray();

        Assert.All(props, p =>
        {
            var isString = p.PropertyType == typeof(string);
            var isStringList = typeof(IEnumerable<string>).IsAssignableFrom(p.PropertyType);
            Assert.True(isString || isStringList,
                $"{p.Name} is {p.PropertyType.Name}; the read path must carry only compatibility strings, never a number.");
        });

        // And no member name hints at an effect size or provenance escaping through this record.
        Assert.All(props, p =>
        {
            Assert.DoesNotContain("effect", p.Name, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("proxy", p.Name, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("provenance", p.Name, StringComparison.OrdinalIgnoreCase);
        });
    }

    private const BindingFlags AllMembers =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly;

    /// <summary>Every type named in a member signature of <paramref name="t"/>: fields, properties, params, returns.</summary>
    private static IEnumerable<Type> SignatureTypes(Type t)
    {
        foreach (var f in t.GetFields(AllMembers))
            foreach (var x in Flatten(f.FieldType)) yield return x;
        foreach (var p in t.GetProperties(AllMembers))
            foreach (var x in Flatten(p.PropertyType)) yield return x;
        foreach (var m in t.GetMethods(AllMembers))
        {
            foreach (var x in Flatten(m.ReturnType)) yield return x;
            foreach (var par in m.GetParameters())
                foreach (var x in Flatten(par.ParameterType)) yield return x;
        }
        foreach (var c in t.GetConstructors(AllMembers))
            foreach (var par in c.GetParameters())
                foreach (var x in Flatten(par.ParameterType)) yield return x;
    }

    private static IEnumerable<Type> Flatten(Type? t)
    {
        if (t is null) yield break;
        if (t.HasElementType)
        {
            foreach (var e in Flatten(t.GetElementType())) yield return e;
            yield break;
        }
        yield return t;
        if (t.IsGenericType)
            foreach (var ga in t.GetGenericArguments())
                foreach (var e in Flatten(ga)) yield return e;
    }
}
