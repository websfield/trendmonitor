using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Scoring;
using UgcIntelligence.C2.Api.Verdicts;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// A6, A6b, A7. The verdict engine is a pure function of the compliance result (and, from Phase 3,
/// scores). These are property tests over the veto power set — no model, no DB, no clock.
/// </summary>
public sealed class VerdictEngineTests
{
    private static readonly string[] All = ["V1", "V2", "V3", "V4", "V5", "V6"];

    /// <summary>Build a compliance result where exactly the ids in <paramref name="fired"/> fired; the rest pass.</summary>
    private static ComplianceResult WithFired(IReadOnlySet<string> fired) =>
        new([.. All.Select(id => fired.Contains(id) ? VetoResult.Fire(id, "x") : VetoResult.Pass(id, "ok"))]);

    private static IEnumerable<HashSet<string>> Subsets(string[] ids)
    {
        for (var mask = 0; mask < (1 << ids.Length); mask++)
        {
            var set = new HashSet<string>();
            for (var i = 0; i < ids.Length; i++)
                if ((mask & (1 << i)) != 0) set.Add(ids[i]);
            yield return set;
        }
    }

    /// <summary>A6. Any non-empty subset of {V1..V5} fired (V6 passing) forces REJECTED — all 31 subsets.</summary>
    [Fact]
    public void V1toV5ForceRejected()
    {
        string[] v1to5 = ["V1", "V2", "V3", "V4", "V5"];
        foreach (var subset in Subsets(v1to5))
        {
            if (subset.Count == 0) continue;   // the empty subset is not a veto firing
            var result = VerdictEngine.Resolve(WithFired(subset));
            Assert.Equal(Verdict.REJECTED, result);
        }
    }

    /// <summary>A6. V6 fired dominates every combination — all 63 subsets of {V1..V6} that include V6.</summary>
    [Fact]
    public void V6ForcesExcluded_Dominates()
    {
        foreach (var subset in Subsets(All))
        {
            if (!subset.Contains("V6")) continue;
            var result = VerdictEngine.Resolve(WithFired(subset));
            Assert.Equal(Verdict.EXCLUDED_FROM_AI_SCORING, result);
        }
    }

    /// <summary>A6b. A V6-excluded submission never enters the calibration dataset.</summary>
    [Fact]
    public void V6Excluded_NotInCalibrationSet()
    {
        Assert.False(VerdictEngine.EntersCalibrationDataset(Verdict.EXCLUDED_FROM_AI_SCORING, anomalous: false));
        Assert.False(VerdictEngine.EntersCalibrationDataset(Verdict.EXCLUDED_FROM_AI_SCORING, anomalous: true));
        // An anomalous score is excluded on the same principle.
        Assert.False(VerdictEngine.EntersCalibrationDataset(Verdict.NEEDS_REVIEW, anomalous: true));
        // A clean, scored verdict does enter.
        Assert.True(VerdictEngine.EntersCalibrationDataset(Verdict.APPROVED, anomalous: false));
    }

    /// <summary>A7. An unevaluable veto never resolves to a pass, in any combination with passing vetoes.</summary>
    [Fact]
    public void UnevaluableVeto_NeverApproves()
    {
        foreach (var id in All)
        {
            var vetoes = All.Select(x => x == id ? VetoResult.Unevaluable(x, "?") : VetoResult.Pass(x, "ok")).ToArray();
            var result = VerdictEngine.Resolve(new ComplianceResult(vetoes));
            Assert.NotEqual(Verdict.APPROVED, result);
            Assert.NotEqual(Verdict.APPROVED_WITH_NOTES, result);
            Assert.Equal(Verdict.NEEDS_REVIEW, result);
        }
    }

    /// <summary>Even with (hypothetical) clean scores supplied, an unevaluable veto still holds the submission.</summary>
    [Fact]
    public void UnevaluableVeto_NeverApproves_EvenWithScores()
    {
        var vetoes = All.Select(x => x == "V2" ? VetoResult.Unevaluable(x, "no ledger") : VetoResult.Pass(x, "ok")).ToArray();
        var result = VerdictEngine.Resolve(new ComplianceResult(vetoes),
            bas: 95m, criteria: new Dictionary<string, decimal> { ["hook_strength"] = 90m });
        Assert.Equal(Verdict.NEEDS_REVIEW, result);
    }

    /// <summary>Phase 1: a fully clean submission awaits the human click — never APPROVED by default.</summary>
    [Fact]
    public void AllPass_ResolvesToNeedsReview_NeverApprovesByDefault()
    {
        var result = VerdictEngine.Resolve(new ComplianceResult(Phase1Fixtures.AllPass()));
        Assert.Equal(Verdict.NEEDS_REVIEW, result);
    }

    /// <summary>V6 fired outranks a simultaneously fired V1..V5: exclusion is not rejection.</summary>
    [Fact]
    public void V6Fired_OutranksOtherFiredVetoes()
    {
        var vetoes = new[] { VetoResult.Fire("V3", "brand"), VetoResult.Fire("V6", "minor") }
            .Concat(new[] { "V1", "V2", "V4", "V5" }.Select(id => VetoResult.Pass(id, "ok"))).ToArray();
        Assert.Equal(Verdict.EXCLUDED_FROM_AI_SCORING, VerdictEngine.Resolve(new ComplianceResult(vetoes)));
    }

    // ---- Phase 3: the scoring ladder (D1) ------------------------------------------------------

    private static ComplianceResult Clean() => new(Phase1Fixtures.AllPass());

    /// <summary>All eight VPS criteria at <paramref name="fill"/>, with the named overrides applied.</summary>
    private static Dictionary<string, decimal> Scores(decimal fill, params (string Key, decimal Score)[] overrides)
    {
        var d = Composition.VpsWeights.Keys.ToDictionary(k => k, _ => fill);
        foreach (var (key, score) in overrides) d[key] = score;
        return d;
    }

    /// <summary>A1. hook_strength &lt; 50 forces ≥ REVISIONS_REQUIRED, even when the hook was scored degraded.</summary>
    [Fact]
    public void HookGate_AppliesWhenDegraded()
    {
        // Every other criterion is excellent; only the hook is low. Degradation flags live on the
        // CriterionScore and are irrelevant here — the engine sees the number 40, and 40 < 50 gates.
        var criteria = Scores(95m, (Composition.HookStrength, 40m));
        Assert.Equal(Verdict.REVISIONS_REQUIRED, VerdictEngine.Resolve(Clean(), bas: 95m, criteria));
    }

    /// <summary>BAS below 60 forces ≥ REVISIONS_REQUIRED regardless of a strong VPS.</summary>
    [Fact]
    public void BasBelow60_ForcesRevisions_EvenWithStrongVps()
    {
        var criteria = Scores(95m);   // VPS would be 95
        Assert.Equal(Verdict.REVISIONS_REQUIRED, VerdictEngine.Resolve(Clean(), bas: 59m, criteria));
    }

    /// <summary>VPS below 70 (BAS fine, hook fine) resolves to APPROVED_WITH_NOTES.</summary>
    [Fact]
    public void VpsBelow70_ApprovedWithNotes()
    {
        var criteria = Scores(65m);   // hook 65 (>=50), VPS 65 (<70)
        Assert.Equal(Verdict.APPROVED_WITH_NOTES, VerdictEngine.Resolve(Clean(), bas: 90m, criteria));
    }

    /// <summary>Clean scores across the board resolve to APPROVED (which still requires a human click to record).</summary>
    [Fact]
    public void CleanScores_ResolveToApproved()
    {
        var criteria = Scores(85m);   // hook 85, VPS 85 (>=70)
        Assert.Equal(Verdict.APPROVED, VerdictEngine.Resolve(Clean(), bas: 90m, criteria));
    }

    /// <summary>A not-yet-scored submission (bas null) never resolves to APPROVED.</summary>
    [Fact]
    public void NotScored_NeverApproves()
    {
        Assert.Equal(Verdict.NEEDS_REVIEW, VerdictEngine.Resolve(Clean(), bas: null, criteria: null));
    }

    /// <summary>An incomplete criteria vector (missing hook_strength) fails closed, not to a pass.</summary>
    [Fact]
    public void MissingHookCriterion_FailsClosed()
    {
        var criteria = new Dictionary<string, decimal> { [Composition.ScrollStopPower] = 90m };
        Assert.Equal(Verdict.NEEDS_REVIEW, VerdictEngine.Resolve(Clean(), bas: 90m, criteria));
    }

    /// <summary>A fired veto still dominates any score — compliance precedes the scoring ladder.</summary>
    [Fact]
    public void FiredVeto_DominatesScores()
    {
        var vetoes = new[] { VetoResult.Fire("V1", "no disclosure") }
            .Concat(new[] { "V2", "V3", "V4", "V5", "V6" }.Select(id => VetoResult.Pass(id, "ok"))).ToArray();
        Assert.Equal(Verdict.REJECTED,
            VerdictEngine.Resolve(new ComplianceResult(vetoes), bas: 99m, criteria: Scores(99m)));
    }
}
