using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.C2.Api.Events;
using UgcIntelligence.C2.Api.Scoring;
using UgcIntelligence.C2.Api.Verdicts;
using UgcIntelligence.Domain.Entities;
using UgcIntelligence.Events;
using UgcIntelligence.Events.Writer;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// Phase R1 (audit 2026-07-14 remediation). Veto/verdict and compliance integrity, guarded at the
/// deterministic boundaries: no auto-approval on the override path (#1), V1 fails closed when extraction
/// is unavailable (#4), a malformed judge result degrades to NEEDS_REVIEW while cancellation propagates
/// (#5), and a human approval must clear the deterministic scoring ladder, not only the compliance vetoes
/// (#11). Each test fails if its guard is reverted (see the phase plan's falsification step).
/// </summary>
public sealed class PhaseR1VetoIntegrityTests
{
    private static (ComplianceEventEmitter emitter, AppendOnlyEventLog log) NewEmitter()
    {
        var log = new AppendOnlyEventLog();
        return (new ComplianceEventEmitter(new OutcomeEventWriter(log)), log);
    }

    private static ComplianceResult CleanCompliance() => new(Phase1Fixtures.AllPass());

    private static Dictionary<string, decimal> ClearingScores(decimal fill = 85m) =>
        Composition.VpsWeights.Keys.ToDictionary(k => k, _ => fill);

    // ---- #1: override into APPROVED is held to the no-auto-approval bar, AT THE BOUNDARY ------------

    /// <summary>
    /// A-R1-1. A direct <c>EmitVerdictOverriddenAsync</c> call (bypassing OverrideService) that overrides
    /// into APPROVED with a null human_approved_at is rejected at the persistence boundary, and nothing is
    /// written. This is REQ-021 on the override path, enforced where the event is appended.
    /// </summary>
    [Fact]
    public async Task OverrideToApproved_WithNullHumanApprovedAt_Throws()
    {
        var (emitter, log) = NewEmitter();
        var record = new VerdictOverriddenRecord(
            Guid.NewGuid(), Phase1Fixtures.Tenant, Verdict.REJECTED, Verdict.APPROVED,
            "reviewer says fine", "reviewer-7", Phase1Fixtures.Now, HumanApprovedAt: null);

        await Assert.ThrowsAsync<AutoApprovalRejectedException>(() =>
            emitter.EmitVerdictOverriddenAsync(record, CleanCompliance()));
        Assert.Equal(0, log.Count);
    }

    /// <summary>
    /// A-R1-2. A direct <c>EmitVerdictOverriddenAsync</c> call that overrides into APPROVED with a real
    /// timestamp but a live fired veto is rejected at the boundary — the boundary computes the veto re-check
    /// itself from the passed <see cref="ComplianceResult"/>, so a caller cannot slip an approval past it by
    /// omitting or falsifying a flag. Nothing is written.
    /// </summary>
    [Fact]
    public async Task OverrideToApproved_OverFiredVeto_Throws_BoundaryComputesReCheck()
    {
        var (emitter, log) = NewEmitter();
        var firedVeto = new ComplianceResult([VetoResult.Fire("V1", "no disclosure"), .. Phase1Fixtures.AllPass().Skip(1)]);
        var record = new VerdictOverriddenRecord(
            Guid.NewGuid(), Phase1Fixtures.Tenant, Verdict.REJECTED, Verdict.APPROVED,
            "reviewer says fine", "reviewer-7", Phase1Fixtures.Now, HumanApprovedAt: Phase1Fixtures.Now);

        // The record carries a real click timestamp and no caller-side veto flag exists to lie about —
        // the boundary still rejects, because it re-checks the live compliance result.
        await Assert.ThrowsAsync<OverrideOverLiveVetoRejectedException>(() =>
            emitter.EmitVerdictOverriddenAsync(record, firedVeto));
        Assert.Equal(0, log.Count);
    }

    /// <summary>
    /// FIX D. Symmetric to the override boundary: a direct <c>EmitVerdictIssuedAsync</c> call with APPROVED,
    /// a real click timestamp, but a non-empty <c>VetoesFired</c> is rejected — a caller that bypasses
    /// ApprovalService cannot record an approval over a live veto on the issue side either. Nothing is written.
    /// </summary>
    [Fact]
    public async Task IssueApproved_WithFiredVeto_AtBoundary_Throws()
    {
        var (emitter, log) = NewEmitter();
        var record = new VerdictIssuedRecord(
            Guid.NewGuid(), Phase1Fixtures.Tenant, Verdict.APPROVED,
            VetoesFired: ["V1"], SuspectedVetoes: [], HumanApprovedAt: Phase1Fixtures.Now, OccurredAt: Phase1Fixtures.Now);

        await Assert.ThrowsAsync<OverrideOverLiveVetoRejectedException>(() => emitter.EmitVerdictIssuedAsync(record));
        Assert.Equal(0, log.Count);
    }

    /// <summary>An unevaluable veto is a blocking veto too: the boundary rejects an APPROVED override over it.</summary>
    [Fact]
    public async Task OverrideToApproved_OverUnevaluableVeto_Throws()
    {
        var (emitter, log) = NewEmitter();
        var unevaluable = new ComplianceResult([VetoResult.Unevaluable("V2", "no ledger"), .. Phase1Fixtures.AllPass().Skip(1)]);
        var record = new VerdictOverriddenRecord(
            Guid.NewGuid(), Phase1Fixtures.Tenant, Verdict.NEEDS_REVIEW, Verdict.APPROVED,
            "reviewer says fine", "reviewer-7", Phase1Fixtures.Now, HumanApprovedAt: Phase1Fixtures.Now);

        await Assert.ThrowsAsync<OverrideOverLiveVetoRejectedException>(() =>
            emitter.EmitVerdictOverriddenAsync(record, unevaluable));
        Assert.Equal(0, log.Count);
    }

    /// <summary>An override into APPROVED with a real click and no blocking veto is recorded, carrying the timestamp.</summary>
    [Fact]
    public async Task OverrideToApproved_WithClickAndNoVeto_IsRecorded()
    {
        var (emitter, log) = NewEmitter();
        var clickAt = Phase1Fixtures.Now.AddMinutes(2);
        var svc = new OverrideService(emitter);

        await svc.OverrideAsync(Guid.NewGuid(), Phase1Fixtures.Tenant, Verdict.REVISIONS_REQUIRED, Verdict.APPROVED,
            "manual review cleared it", "reviewer-7", CleanCompliance(), clickAt, Phase1Fixtures.Now);

        var events = new List<OutcomeEvent>();
        await foreach (var e in log.ReplayAsync(Phase1Fixtures.Tenant)) events.Add(e);
        var ev = Assert.Single(events);
        Assert.Equal(OutcomeEventType.VerdictOverridden, ev.EventType);
        Assert.Equal("APPROVED", ev.Payload["override_verdict"]);
        Assert.Equal(clickAt, ev.Payload["human_approved_at"]);
    }

    /// <summary>OverrideService passes the live compliance through; the boundary re-checks it and rejects an override into APPROVED over a fired veto.</summary>
    [Fact]
    public async Task OverrideService_ToApproved_OverFiredVeto_IsRejected()
    {
        var (emitter, _) = NewEmitter();
        var svc = new OverrideService(emitter);
        var firedVeto = new ComplianceResult([VetoResult.Fire("V1", "no disclosure"), .. Phase1Fixtures.AllPass().Skip(1)]);

        await Assert.ThrowsAsync<OverrideOverLiveVetoRejectedException>(() =>
            svc.OverrideAsync(Guid.NewGuid(), Phase1Fixtures.Tenant, Verdict.REJECTED, Verdict.APPROVED,
                "reviewer says fine", "reviewer-7", firedVeto, Phase1Fixtures.Now, Phase1Fixtures.Now));
    }

    // ---- #4: V1 fails closed when extraction is unavailable and the caption alone is inconclusive ----

    /// <summary>
    /// A-R1-3. features == null, caption bare (no product claim), not sponsored ⇒ V1 is Unevaluable
    /// (held for review), never a silent Pass — a claim spoken on audio or shown on screen is invisible.
    /// </summary>
    [Fact]
    public void V1_NullFeatures_BareCaption_IsUnevaluable_NotPass()
    {
        var sub = Phase1Fixtures.Submission("Sunday walk by the river, felt nice", sponsored: false);

        var v1 = DisclosureDetector.Evaluate(features: null, sub, PlatformDisclosureRules.Default);

        Assert.False(v1.Fired);        // unevaluable is not fired...
        Assert.False(v1.Evaluable);    // ...and it is not a pass either — held for human review
    }

    /// <summary>Control: with features present, the same bare non-claim caption keeps its carve-out Pass (unchanged).</summary>
    [Fact]
    public void V1_WithFeatures_BareCaption_StillPasses_CarveOut()
    {
        var sub = Phase1Fixtures.Submission("Sunday walk by the river, felt nice", sponsored: false);

        var v1 = DisclosureDetector.Evaluate(Phase1Fixtures.FeaturesNoDisclosure(sub.Id), sub, PlatformDisclosureRules.Default);

        Assert.False(v1.Fired);
        Assert.True(v1.Evaluable);     // carve-out pass is authoritative only when the whole submission was read
    }

    // ---- #5: a malformed judge result degrades to NEEDS_REVIEW; cancellation propagates --------------

    private static ScoringService NewScoringService(IJudge judge, out AppendOnlyEventLog log)
    {
        log = new AppendOnlyEventLog();
        return new ScoringService(judge, new ComplianceEventEmitter(new OutcomeEventWriter(log)));
    }

    private static Task<ScoringResult> Score(ScoringService svc, IReadOnlyList<string>? suspected = null, CancellationToken ct = default) =>
        svc.ScoreAsync(
            Phase3Fixtures.CleanCompliance(),
            Phase1Fixtures.Submission(),
            Phase1Fixtures.BriefNoRequirements(),
            Phase3Fixtures.Features(),
            Phase3Fixtures.Prompt(),
            Phase3Fixtures.Triple,
            Phase3Fixtures.Cohort,
            Phase3Fixtures.CompatibleExtractors,
            breakerRead: null,
            occurredAt: Phase1Fixtures.Now,
            ct);

    /// <summary>
    /// A-R1-4 (validator-level). <c>TryValidate</c> null-checks <c>Criteria</c> and returns a schema
    /// failure rather than indexing a null map and throwing an NRE. This test bites specifically on the
    /// validator guard — independent of the ScoringService widened-catch backstop.
    /// </summary>
    [Fact]
    public void JudgeResultValidator_NullCriteria_ReturnsSchemaFailure()
    {
        var ok = JudgeResultValidator.TryValidate(new JudgeResult(null!, []), out var validated, out var failure);

        Assert.False(ok);
        Assert.Null(validated);
        Assert.NotNull(failure);
    }

    /// <summary>
    /// A-R1-4. A judge result with a null Criteria map is unparseable output: the validator null-checks it,
    /// so both attempts are schema failures and the score degrades to NEEDS_REVIEW — never an uncaught NRE,
    /// never a default score.
    /// </summary>
    [Fact]
    public async Task JudgeResult_NullCriteria_DegradesToNeedsReview()
    {
        var svc = NewScoringService(Phase3Fixtures.JudgeReturning(new JudgeResult(null!, [])), out var log);

        var result = await Score(svc);

        Assert.False(result.Scored);
        Assert.Equal(Verdict.NEEDS_REVIEW, result.Verdict);
        Assert.Contains("model_schema_invalid_twice", result.Reasons);
        Assert.Equal(0, log.Count);   // no default score persisted
    }

    /// <summary>
    /// #5 (widened catch). An arbitrary unexpected exception from the judge (e.g. an NRE from a live judge
    /// returning a mis-shaped result) is treated as unparseable output and degrades to NEEDS_REVIEW, not an
    /// escaped exception.
    /// </summary>
    [Fact]
    public async Task Judge_UnexpectedException_DegradesToNeedsReview()
    {
        var svc = NewScoringService(Phase3Fixtures.JudgeThrowing(() => new NullReferenceException("boom")), out var log);

        var result = await Score(svc);

        Assert.False(result.Scored);
        Assert.Equal(Verdict.NEEDS_REVIEW, result.Verdict);
        Assert.Contains("model_schema_invalid_twice", result.Reasons);
        Assert.Equal(0, log.Count);
    }

    /// <summary>
    /// #5 (cancellation exemption). An <see cref="OperationCanceledException"/> from the judge propagates
    /// out of the scoring pipeline — cooperative cancellation is never laundered into a NEEDS_REVIEW decision.
    /// </summary>
    [Fact]
    public async Task Judge_OperationCanceled_Propagates_NotNeedsReview()
    {
        var svc = NewScoringService(Phase3Fixtures.JudgeThrowing(() => new OperationCanceledException("caller cancelled")), out _);

        await Assert.ThrowsAsync<OperationCanceledException>(() => Score(svc));
    }

    // ---- #11: a human approval must clear the deterministic BAS/hook ladder, not only the vetoes -------

    private static ApprovalService NewApprovalService(out AppendOnlyEventLog log)
    {
        log = new AppendOnlyEventLog();
        return new ApprovalService(new ComplianceEventEmitter(new OutcomeEventWriter(log)));
    }

    /// <summary>
    /// A-R1-5. A submission the engine routes to REVISIONS_REQUIRED (bas &lt; 60) has cleared its vetoes but
    /// not the scoring ladder: RecordHumanApproval rejects it. A human click is not a bypass of the ladder.
    /// </summary>
    [Fact]
    public async Task RecordHumanApproval_UnclearedLadder_IsRejected()
    {
        var svc = NewApprovalService(out var log);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            svc.RecordHumanApprovalAsync(Guid.NewGuid(), Phase1Fixtures.Tenant, CleanCompliance(),
                bas: 59m, scores: ClearingScores(), suspectedVetoes: [], humanApprovedAt: Phase1Fixtures.Now,
                occurredAt: Phase1Fixtures.Now));
        Assert.Equal(0, log.Count);
    }

    /// <summary>An unscored submission (bas null ⇒ engine NEEDS_REVIEW) is likewise not human-approvable.</summary>
    [Fact]
    public async Task RecordHumanApproval_Unscored_IsRejected()
    {
        var svc = NewApprovalService(out var log);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            svc.RecordHumanApprovalAsync(Guid.NewGuid(), Phase1Fixtures.Tenant, CleanCompliance(),
                bas: null, scores: null, suspectedVetoes: [], humanApprovedAt: Phase1Fixtures.Now,
                occurredAt: Phase1Fixtures.Now));
        Assert.Equal(0, log.Count);
    }

    /// <summary>
    /// A-R1-5. APPROVED_WITH_NOTES (clean vetoes, bas ok, hook ok, vps &lt; 70) is a cleared ladder and IS
    /// human-approvable: a strict <c>== APPROVED</c> pre-state would wrongly make it unapprovable forever.
    /// </summary>
    [Fact]
    public async Task RecordHumanApproval_ApprovedWithNotesPreState_IsApprovable()
    {
        var svc = NewApprovalService(out var log);
        var clickAt = Phase1Fixtures.Now.AddMinutes(4);

        // vps < 70 (fill 65) with hook 65 (>= 50) and bas 90 ⇒ engine resolves APPROVED_WITH_NOTES.
        await svc.RecordHumanApprovalAsync(Guid.NewGuid(), Phase1Fixtures.Tenant, CleanCompliance(),
            bas: 90m, scores: ClearingScores(65m), suspectedVetoes: [], humanApprovedAt: clickAt,
            occurredAt: Phase1Fixtures.Now);

        var events = new List<OutcomeEvent>();
        await foreach (var e in log.ReplayAsync(Phase1Fixtures.Tenant)) events.Add(e);
        var ev = Assert.Single(events);
        Assert.Equal("APPROVED", ev.Payload["verdict"]);
        Assert.Equal(clickAt, ev.Payload["human_approved_at"]);
    }

    /// <summary>A clean, fully-scored submission (engine APPROVED) is human-approvable and carries the click timestamp.</summary>
    [Fact]
    public async Task RecordHumanApproval_ClearedLadder_IsApproved()
    {
        var svc = NewApprovalService(out var log);
        var clickAt = Phase1Fixtures.Now.AddMinutes(6);

        await svc.RecordHumanApprovalAsync(Guid.NewGuid(), Phase1Fixtures.Tenant, CleanCompliance(),
            bas: 90m, scores: ClearingScores(), suspectedVetoes: [], humanApprovedAt: clickAt,
            occurredAt: Phase1Fixtures.Now);

        var events = new List<OutcomeEvent>();
        await foreach (var e in log.ReplayAsync(Phase1Fixtures.Tenant)) events.Add(e);
        Assert.Equal(clickAt, Assert.Single(events).Payload["human_approved_at"]);
    }

    // ---- #19: hook_gate_fired carries true on a hook-gated revise, false otherwise -------------------

    private static async Task<OutcomeEvent> SingleEvent(AppendOnlyEventLog log)
    {
        var events = new List<OutcomeEvent>();
        await foreach (var e in log.ReplayAsync(Phase1Fixtures.Tenant)) events.Add(e);
        return Assert.Single(events);
    }

    /// <summary>
    /// #19. A REVISIONS_REQUIRED forced by <c>hook &lt; 50</c> carries <c>hook_gate_fired = true</c> on the
    /// emitted VerdictIssued event — the field is populated from the same single-source
    /// <see cref="VerdictEngine.HookGateFired"/> predicate, threaded through <c>IssueAsync</c>. A C1/C3
    /// calibration consumer can see the hook gate fired.
    /// </summary>
    [Fact]
    public async Task IssueRevisions_FromHookGate_CarriesHookGateFiredTrue()
    {
        var svc = NewApprovalService(out var log);
        var scores = ClearingScores();
        scores[Composition.HookStrength] = 40m;                       // hook < 50
        var verdict = VerdictEngine.Resolve(CleanCompliance(), bas: 95m, scores);
        Assert.Equal(Verdict.REVISIONS_REQUIRED, verdict);            // gated by the hook, not BAS

        await svc.IssueAsync(Guid.NewGuid(), Phase1Fixtures.Tenant, verdict, CleanCompliance(),
            scores, suspectedVetoes: [], occurredAt: Phase1Fixtures.Now);

        var ev = await SingleEvent(log);
        Assert.Equal("REVISIONS_REQUIRED", ev.Payload["verdict"]);
        Assert.Equal(true, ev.Payload["hook_gate_fired"]);
    }

    /// <summary>
    /// #19. A REVISIONS_REQUIRED forced by the BAS floor (bas &lt; 60) with a healthy hook carries
    /// <c>hook_gate_fired = false</c> — the hook gate did not fire; the BAS floor did. The field
    /// distinguishes the two revise causes rather than being always-true or always-false.
    /// </summary>
    [Fact]
    public async Task IssueRevisions_FromBasFloor_CarriesHookGateFiredFalse()
    {
        var svc = NewApprovalService(out var log);
        var scores = ClearingScores();                                // hook 85 (>= 50)
        var verdict = VerdictEngine.Resolve(CleanCompliance(), bas: 50m, scores);
        Assert.Equal(Verdict.REVISIONS_REQUIRED, verdict);           // gated by BAS floor, not the hook

        await svc.IssueAsync(Guid.NewGuid(), Phase1Fixtures.Tenant, verdict, CleanCompliance(),
            scores, suspectedVetoes: [], occurredAt: Phase1Fixtures.Now);

        var ev = await SingleEvent(log);
        Assert.Equal(false, ev.Payload["hook_gate_fired"]);
    }

    /// <summary>A pre-scoring compliance verdict (no scores) carries <c>hook_gate_fired = false</c>, not an error.</summary>
    [Fact]
    public async Task IssueRejected_NoScores_CarriesHookGateFiredFalse()
    {
        var svc = NewApprovalService(out var log);
        var firedVeto = new ComplianceResult([VetoResult.Fire("V4", "no grant"), .. Phase1Fixtures.AllPass().Skip(1)]);

        await svc.IssueAsync(Guid.NewGuid(), Phase1Fixtures.Tenant, Verdict.REJECTED, firedVeto,
            scores: null, suspectedVetoes: [], occurredAt: Phase1Fixtures.Now);

        var ev = await SingleEvent(log);
        Assert.Equal(false, ev.Payload["hook_gate_fired"]);
    }

    // ---- #20: the FromModel adapter carries the fixed model-raised rationale -------------------------

    /// <summary>#20. SuspectedVeto.FromModel attaches the fixed model-raised rationale, marking a suspicion as surfaced, not decided.</summary>
    [Fact]
    public void SuspectedVeto_FromModel_AttachesModelRaisedRationale()
    {
        var s = SuspectedVeto.FromModel("V1");
        Assert.Equal("V1", s.VetoId);
        Assert.Equal(SuspectedVeto.ModelRaisedRationale, s.Rationale);
    }
}
