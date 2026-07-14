using System.Reflection;
using System.Reflection.Emit;
using System.Xml.Linq;
using UgcIntelligence.C2.Api.Verdicts;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// P3-T9 (Rule 5, REQ-066 / REQ-005e). <strong>No mechanism, trend, or pattern-library type is reachable
/// from any scoring path.</strong> Trend signals and mechanisms never enter VPS or BAS at any weight — the
/// scorer measures craft, not what a belief engine thinks is fashionable.
///
/// <para>The guarantee is asserted at two levels, because one alone would leave a gap:</para>
/// <list type="number">
/// <item><description><em>Reachability.</em> The scoring assembly (<c>UgcIntelligence.C2.Api</c>) does not
/// reference the mechanism contracts assembly at all — declared in the build graph and emitted in metadata.
/// A boundary that holds because there is <em>nothing in the process to reach</em> cannot be defeated by a
/// convenient refactor. This is the same technique as the reference-graph suite, aimed at the scoring
/// plane, and it is falsifiable: adding the project reference turns it red.</description></item>
/// <item><description><em>Type reference.</em> No type on the scoring path (the <c>Scoring</c> and
/// <c>Notes</c> namespaces, plus <see cref="VerdictEngine"/>) references — in a signature or in method-body
/// IL — any type whose name reads as a mechanism/trend/pattern/belief concept. This catches a future belief
/// type added into an assembly the scorer legitimately references (e.g. <c>Domain</c>), which the
/// assembly-level check could not see.</description></item>
/// </list>
///
/// <para>The scanner carries its own falsifiability: <c>Scan_FlagsAMechanismLikeReference_AndOnlyThat</c>
/// proves it detects a forbidden-named reference (sensitivity) and ignores a benign one (specificity), so
/// the suite cannot decay into one that certifies an absence. The IL walker is duplicated from
/// <c>ModelNotInDecisionPathTests</c> on purpose — a shared helper turned no-op would silently vacate both
/// suites at once, which is exactly the failure these architecture tests exist to prevent.</para>
/// </summary>
public sealed class ScoringInputsForbiddenTests
{
    private const string ScoringAssembly = "UgcIntelligence.C2.Api";
    private const string MechanismContracts = "UgcIntelligence.Contracts.Mechanisms";

    private const string ScoringNamespace = "UgcIntelligence.C2.Api.Scoring";
    private const string NotesNamespace = "UgcIntelligence.C2.Api.Notes";

    /// <summary>Concept tokens for a belief type: mechanism, trend, pattern library, warrant ladder.</summary>
    private static readonly string[] ForbiddenNameTokens = ["mechanism", "trend", "pattern", "warrant", "belief"];

    private static bool IsForbiddenName(Type t) =>
        ForbiddenNameTokens.Any(tok => t.Name.Contains(tok, StringComparison.OrdinalIgnoreCase));

    private const BindingFlags AllMembers =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly;

    // ==== (1) reachability: the scoring assembly cannot even load a mechanism/belief type ============

    [Fact]
    public void ScoringAssembly_DoesNotReference_TheMechanismContracts()
    {
        Assert.DoesNotContain(MechanismContracts, DeclaredReferences(ScoringAssembly));
        Assert.DoesNotContain(MechanismContracts, EmittedReferences(ScoringAssembly));
    }

    // ==== (2) type reference: nothing on the scoring path names a belief type ========================

    [Fact]
    public void NoScoringPathType_ReferencesAMechanismTrendOrPatternType()
    {
        foreach (var type in ScoringPathTypes())
        {
            foreach (var referenced in SignatureTypes(type))
                AssertAllowed(type, referenced, "signature");

            foreach (var method in MethodsOf(type))
                foreach (var referenced in ReferencedTypes(method))
                    AssertAllowed(type, referenced, "IL");
        }
    }

    private static void AssertAllowed(Type owner, Type referenced, string via) =>
        Assert.False(IsForbiddenName(referenced),
            $"Rule 5 VIOLATION: scoring-path type {owner.FullName} references {referenced.FullName} ({via}). "
            + "No mechanism, trend, or pattern-library type enters a VPS or BAS — not at any weight. "
            + "The scorer measures craft; a belief engine's output is not an input to it.");

    // ==== (3) the self-check: the scanner detects a belief-named reference, and only that ============

    [Fact]
    public void Scan_FlagsAMechanismLikeReference_AndOnlyThat()
    {
        var touches = typeof(ForbiddenNameCanary).GetMethod(nameof(ForbiddenNameCanary.TouchesAMechanism), AllMembers)!;
        Assert.Contains(ReferencedTypes(touches), IsForbiddenName);   // sensitivity: it sees the belief type

        var benign = typeof(ForbiddenNameCanary).GetMethod(nameof(ForbiddenNameCanary.TouchesOnlyStrings), AllMembers)!;
        Assert.DoesNotContain(ReferencedTypes(benign), IsForbiddenName);   // specificity: no false positive
    }

    /// <summary>A stand-in for a C1 belief type. Its name alone marks it forbidden on any scoring path.</summary>
    private sealed record MechanismStub(string Statement);

    private static class ForbiddenNameCanary
    {
        public static object TouchesAMechanism() => new MechanismStub("a poisoned belief must never reach a score");
        public static int TouchesOnlyStrings() => "craft, not fashion".Length;
    }

    // ==== scoring-path type set ======================================================================

    private static IEnumerable<Type> ScoringPathTypes()
    {
        foreach (var t in Assembly.Load(ScoringAssembly).GetTypes())
        {
            var ns = t.Namespace ?? string.Empty;
            if (ns == ScoringNamespace || ns == NotesNamespace)
            {
                yield return t;
                continue;
            }

            for (var enclosing = t; enclosing is not null; enclosing = enclosing.DeclaringType)
                if (enclosing == typeof(VerdictEngine)) { yield return t; break; }
        }
    }

    private static IEnumerable<MethodBase> MethodsOf(Type t) =>
        t.GetMethods(AllMembers).Cast<MethodBase>().Concat(t.GetConstructors(AllMembers));

    /// <summary>Every type named in a member signature of <paramref name="t"/>: fields, properties, method params, returns.</summary>
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

    // ==== assembly reference graph (declared + emitted) ==============================================

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

    // ==== IL scanner (self-contained; see class remarks for why it is not shared) ====================

    private static readonly Dictionary<short, OpCode> OpCodeByValue =
        typeof(OpCodes).GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(f => f.FieldType == typeof(OpCode))
            .Select(f => (OpCode)f.GetValue(null)!)
            .ToDictionary(op => op.Value);

    private static IEnumerable<Type> ReferencedTypes(MethodBase method)
    {
        MethodBody? body;
        try { body = method.GetMethodBody(); }
        catch { yield break; }
        if (body is null) yield break;

        var il = body.GetILAsByteArray();
        if (il is null) yield break;

        var module = method.Module;
        var typeArgs = method.DeclaringType is { IsGenericType: true } dt ? dt.GetGenericArguments() : null;
        var methodArgs = method is MethodInfo { IsGenericMethodDefinition: true } gm ? gm.GetGenericArguments() : null;

        var pos = 0;
        while (pos < il.Length)
        {
            short code = il[pos];
            if (il[pos] == 0xFE && pos + 1 < il.Length) { code = (short)(0xFE00 | il[pos + 1]); pos += 2; }
            else pos += 1;

            if (!OpCodeByValue.TryGetValue(code, out var op)) yield break;

            switch (op.OperandType)
            {
                case OperandType.InlineNone:
                    break;
                case OperandType.ShortInlineBrTarget:
                case OperandType.ShortInlineI:
                case OperandType.ShortInlineVar:
                    pos += 1; break;
                case OperandType.InlineVar:
                    pos += 2; break;
                case OperandType.InlineBrTarget:
                case OperandType.InlineI:
                case OperandType.ShortInlineR:
                case OperandType.InlineString:
                case OperandType.InlineSig:
                    pos += 4; break;
                case OperandType.InlineI8:
                case OperandType.InlineR:
                    pos += 8; break;
                case OperandType.InlineSwitch:
                    {
                        var n = BitConverter.ToInt32(il, pos);
                        pos += 4 + (n * 4);
                        break;
                    }
                case OperandType.InlineType:
                case OperandType.InlineField:
                case OperandType.InlineMethod:
                case OperandType.InlineTok:
                    {
                        var token = BitConverter.ToInt32(il, pos);
                        pos += 4;
                        foreach (var t in ResolveToken(module, token, typeArgs, methodArgs))
                            yield return t;
                        break;
                    }
                default:
                    yield break;
            }
        }
    }

    private static IEnumerable<Type> ResolveToken(Module module, int token, Type[]? typeArgs, Type[]? methodArgs)
    {
        Type? asType = null;
        try { asType = module.ResolveType(token, typeArgs, methodArgs); } catch { /* not a type token */ }
        if (asType is not null)
        {
            foreach (var t in Flatten(asType)) yield return t;
            yield break;
        }

        MemberInfo? member = null;
        try { member = module.ResolveMember(token, typeArgs, methodArgs); } catch { /* unresolvable; ignore */ }
        if (member is null) yield break;

        switch (member)
        {
            case Type mt:
                foreach (var t in Flatten(mt)) yield return t;
                break;
            case FieldInfo fi:
                foreach (var t in Flatten(fi.DeclaringType)) yield return t;
                foreach (var t in Flatten(fi.FieldType)) yield return t;
                break;
            case MethodBase mb:
                foreach (var t in Flatten(mb.DeclaringType)) yield return t;
                foreach (var p in mb.GetParameters())
                    foreach (var t in Flatten(p.ParameterType)) yield return t;
                if (mb is MethodInfo rmi)
                    foreach (var t in Flatten(rmi.ReturnType)) yield return t;
                break;
        }
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
