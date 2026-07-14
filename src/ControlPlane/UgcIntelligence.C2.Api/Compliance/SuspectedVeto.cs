namespace UgcIntelligence.C2.Api.Compliance;

/// <summary>
/// Rule 1. A model may <em>raise</em> a suspected veto for a human's attention. That is the entire
/// extent of its authority over the compliance gate.
///
/// <para>This type is <strong>surfaced</strong> — stored on the <c>VerdictIssued</c> event and shown
/// in the API response. It is <strong>never read</strong> by veto or verdict computation: neither
/// <see cref="ComplianceGate"/> nor <c>VerdictEngine</c> references it, and no configuration makes it
/// so. A model that could clear a veto would make the agency's representation that submissions are
/// checked for disclosure untrue — a silent regulatory breach (P1). The static assertion in
/// <c>ModelNotInDecisionPathTests</c> fails the build if this type ever reaches the decision path.</para>
/// </summary>
public sealed record SuspectedVeto(string VetoId, string Rationale)
{
    /// <summary>
    /// #20. The explicit adapter from the model's raw <c>IReadOnlyList&lt;string&gt; SuspectedVetoes</c>
    /// (see <c>JudgeResult</c>) to the surfaced <see cref="SuspectedVeto"/> record. It attaches the fixed
    /// <see cref="ModelRaisedRationale"/> — a model-raised suspicion is <strong>surfaced for a human</strong>,
    /// never a computed veto with evidence. Passing a raw model string through this adapter changes nothing
    /// about the decision path: neither <see cref="ComplianceGate"/> nor <c>VerdictEngine</c> reads a
    /// <see cref="SuspectedVeto"/>, and <c>ModelNotInDecisionPathTests</c> fails the build if one ever does.
    /// </summary>
    public static SuspectedVeto FromModel(string vetoId) => new(vetoId, ModelRaisedRationale);

    /// <summary>The fixed rationale marking a suspicion as model-raised and human-bound, never a computed veto.</summary>
    public const string ModelRaisedRationale = "model-raised suspicion, surfaced for human review (never a computed veto)";
}
