using System.Reflection;
using System.Reflection.Emit;
using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Scoring;
using UgcIntelligence.C2.Api.Verdicts;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// P1-T10 + P3-T8. Rule 1, asserted structurally: <c>ComplianceGate</c> and <c>VerdictEngine</c> — the two
/// types that compute vetoes and verdicts — reference <strong>no model-output type</strong>. The model may
/// raise a <c>suspected_veto</c> and score criteria for a human's attention; its output is never an input
/// to the decision.
///
/// <para><strong>The forbidden set is a set of TYPES, not a namespace.</strong> This is the granularity
/// that matters after Phase 3: <c>VerdictEngine</c> now legitimately has <c>using ...Scoring;</c> because
/// it calls the deterministic <see cref="Composition"/> helper to compose VPS from plain criterion
/// <em>numbers</em>. That is correct — the numbers reach the verdict; the model's <em>types</em>
/// (<see cref="SuspectedVeto"/>, <see cref="JudgeResult"/>, <see cref="CriterionScore"/>) do not. So the
/// scan flags a reference to those three types anywhere in the decision-path IL, while allowing
/// <c>Composition</c>, <c>decimal</c>, and the criterion-number path through untouched.</para>
///
/// <para><strong>Why this scans IL and not just member signatures.</strong> A member-level reflection
/// check (fields, parameters, return types) catches a model output added to a <em>signature</em>, but not
/// the failure the eval plan actually names: a body that <em>reads</em> <c>suspected_veto[]</c> (or a
/// <c>JudgeResult</c>) mid-method to clear a veto. So this suite walks the CIL of every method (including
/// the compiler-generated closures for lambdas) and resolves each metadata token, flagging any reference
/// to a forbidden type. The technique is dependency-free — <see cref="MethodBody.GetILAsByteArray"/> plus
/// <see cref="Module"/> token resolution, the same BCL surface the reference-graph suite uses, no new NuGet.</para>
///
/// <para>This test must be able to fail. <c>Scanner_DetectsAReference_WhenItExists</c> is the self-check:
/// it scans a canary method that deliberately touches each forbidden type and asserts the scanner sees it.
/// If a refactor ever turns the IL walker into a no-op, that self-check goes red before this suite can
/// silently certify an absence. The live proof: adding a <c>JudgeResult</c> or <c>suspected_veto</c> read
/// to <c>VerdictEngine.Resolve</c> turns the main test red.</para>
/// </summary>
public sealed class ModelNotInDecisionPathTests
{
    /// <summary>
    /// The model-output types. Each is surfaced on events and responses; none is ever in the decision path.
    /// The set is deliberately at type granularity — the deterministic <see cref="Composition"/> path that
    /// carries plain criterion numbers into the verdict is not forbidden, only the model's own types are.
    /// </summary>
    private static readonly HashSet<Type> ForbiddenTypes =
        [typeof(SuspectedVeto), typeof(JudgeResult), typeof(CriterionScore)];

    private static bool IsForbidden(Type t) => ForbiddenTypes.Contains(t);

    private const BindingFlags AllMembers =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly;

    // ---- (1) the main assertion: no decision-path IL references any model-output type -------------

    [Fact]
    public void ComplianceGate_And_VerdictEngine_ReferenceNo_ModelOutputType()
    {
        foreach (var type in DecisionPathTypes())
            foreach (var method in MethodsOf(type))
            {
                var hit = ReferencedTypes(method).FirstOrDefault(IsForbidden);
                Assert.True(hit is null,
                    $"P1 VIOLATION: {type.FullName}.{method.Name} references {hit?.Name} in its IL. "
                    + "The model's output (suspected_veto / JudgeResult / CriterionScore) is never an input to "
                    + "veto or verdict computation (Rule 1) — only the deterministic numbers are. "
                    + "A model-influenced compliance decision is a silent regulatory breach.");
            }
    }

    // ---- (2) defence in depth: no signature on the two types mentions a model-output type ---------

    [Fact]
    public void NoDecisionPathSignature_MentionsTheModelOutputType()
    {
        foreach (var type in new[] { typeof(ComplianceGate), typeof(VerdictEngine) })
        {
            foreach (var method in type.GetMethods(AllMembers))
            {
                Assert.DoesNotContain(Flatten(method.ReturnType), IsForbidden);
                foreach (var p in method.GetParameters())
                    Assert.DoesNotContain(Flatten(p.ParameterType), IsForbidden);
            }

            foreach (var field in type.GetFields(AllMembers))
                Assert.DoesNotContain(Flatten(field.FieldType), IsForbidden);
        }
    }

    // ---- (2b) the deterministic composition path IS allowed (granularity, stated as a test) -------

    /// <summary>
    /// The counterexample that pins the granularity: <c>VerdictEngine.Resolve</c> genuinely references the
    /// <see cref="Composition"/> type (a Scoring-namespace type) and <c>decimal</c>, and that must stay
    /// green. If this test ever fails, the forbidden set has been widened to namespace granularity and the
    /// deterministic VPS composition — numbers, not model types — has been wrongly implicated.
    /// </summary>
    [Fact]
    public void DeterministicCompositionPath_IsNotForbidden()
    {
        Assert.False(IsForbidden(typeof(Composition)), "Composition is the deterministic VPS helper; numbers, not model types.");
        Assert.False(IsForbidden(typeof(decimal)), "criterion numbers reach the verdict; that is the design.");

        var resolve = typeof(VerdictEngine).GetMethod(nameof(VerdictEngine.Resolve))!;
        var referenced = ReferencedTypes(resolve).ToHashSet();
        Assert.Contains(typeof(Composition), referenced);   // it really does use the deterministic helper...
        Assert.DoesNotContain(referenced, IsForbidden);     // ...and none of the model-output types.
    }

    // ---- (2c) #20: the FromModel adapter's output is a forbidden type, absent from the decision path -

    /// <summary>
    /// Phase R1 (#20 / Rule 1). The <c>SuspectedVeto.FromModel</c> adapter bridges the model's raw
    /// <c>IReadOnlyList&lt;string&gt;</c> to the surfaced <see cref="SuspectedVeto"/> record — and that
    /// record is precisely a <em>forbidden</em> model-output type. This pins two facts: the adapter's
    /// return type is forbidden in the decision path, and no <c>ComplianceGate</c>/<c>VerdictEngine</c>
    /// method references <see cref="SuspectedVeto"/> in its IL. So a suspicion routed through the adapter
    /// can be surfaced, never read by a veto or verdict computation.
    /// </summary>
    [Fact]
    public void SuspectedVetoFromModel_Output_NeverReachesDecisionPath()
    {
        var fromModel = typeof(SuspectedVeto).GetMethod(nameof(SuspectedVeto.FromModel))!;
        Assert.True(IsForbidden(fromModel.ReturnType),
            "SuspectedVeto.FromModel returns SuspectedVeto — a model-output type that is never a decision input.");

        foreach (var type in DecisionPathTypes())
            foreach (var method in MethodsOf(type))
                Assert.DoesNotContain(ReferencedTypes(method), t => t == typeof(SuspectedVeto));
    }

    // ---- (3) the self-check: prove the IL scanner is not a no-op -----------------------------------

    /// <summary>
    /// The scanner must detect a reference when one exists, or the whole suite is vacuous. This canary
    /// touches each forbidden type exactly the way a violation would — body-level references the signature
    /// check alone would miss — and the scanner is required to find all of them.
    /// </summary>
    [Fact]
    public void Scanner_DetectsAReference_WhenItExists()
    {
        var canary = typeof(Canary).GetMethod(nameof(Canary.TouchesTheModelOutput), AllMembers)!;
        var referenced = ReferencedTypes(canary).ToHashSet();

        foreach (var forbidden in ForbiddenTypes)
            Assert.Contains(forbidden, referenced);
    }

    private static class Canary
    {
        // Body-level references only: no parameter, no field, no return of a forbidden type — the exact
        // shape of the injection the plan warns about ("reads suspected_veto[] / a JudgeResult mid-method").
        public static string TouchesTheModelOutput()
        {
            var raised = new List<SuspectedVeto> { new("V1", "if this reaches IL, the scanner must see it") };
            var criterion = new CriterionScore(50m, "evidence", Degraded: false);
            var judged = new JudgeResult(new Dictionary<string, CriterionScore> { ["hook_strength"] = criterion }, raised.Select(r => r.VetoId).ToList());
            return $"{raised.Count}:{judged.Criteria.Count}:{criterion.Score}";
        }
    }

    // ---- IL scanner -------------------------------------------------------------------------------

    /// <summary>The two decision-path types plus their compiler-generated nested closures (lambda bodies).</summary>
    private static IEnumerable<Type> DecisionPathTypes()
    {
        foreach (var root in new[] { typeof(ComplianceGate), typeof(VerdictEngine) })
        {
            yield return root;
            foreach (var nested in NestedRecursive(root))
                yield return nested;
        }
    }

    private static IEnumerable<Type> NestedRecursive(Type t)
    {
        foreach (var n in t.GetNestedTypes(BindingFlags.Public | BindingFlags.NonPublic))
        {
            yield return n;
            foreach (var m in NestedRecursive(n)) yield return m;
        }
    }

    private static IEnumerable<MethodBase> MethodsOf(Type t) =>
        t.GetMethods(AllMembers).Cast<MethodBase>().Concat(t.GetConstructors(AllMembers));

    private static readonly Dictionary<short, OpCode> OpCodeByValue =
        typeof(OpCodes).GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(f => f.FieldType == typeof(OpCode))
            .Select(f => (OpCode)f.GetValue(null)!)
            .ToDictionary(op => op.Value);

    /// <summary>
    /// Every type referenced by the CIL of <paramref name="method"/>: types loaded via <c>ldtoken</c>,
    /// declaring types of called methods and accessed fields, and their parameter, return, and generic
    /// argument types. Unresolvable tokens are ignored (they are never the simple forbidden type), so a
    /// resolution failure can never produce a false positive nor throw.
    /// </summary>
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

            if (!OpCodeByValue.TryGetValue(code, out var op)) yield break;   // cannot decode further; bail safely

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
                case OperandType.InlineString:   // string token — ignore
                case OperandType.InlineSig:       // standalone signature — ignore
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
                    yield break;   // unknown operand shape; bail rather than mis-advance
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

    /// <summary>A type and every type reachable from it: element types, generic arguments, recursively.</summary>
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
