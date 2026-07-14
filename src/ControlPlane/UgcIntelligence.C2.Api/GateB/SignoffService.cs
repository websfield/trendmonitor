using UgcIntelligence.Domain.Entities;

namespace UgcIntelligence.C2.Api.GateB;

/// <summary>The outcome of a sign-off attempt: whether it was signed off, the event id, and the re-check result.</summary>
public sealed record SignoffResult(bool SignedOff, Guid? EventId, GateBResult ReChecked);

/// <summary>
/// P5-T7, REQ-037. A named human reviewer signs off before anything reaches a client. Who, when, and what
/// modification are recorded, and <c>AmplificationSignedOff</c> is emitted.
///
/// <para><strong>The rights gate runs twice.</strong> A grant can expire between ranking and sign-off, so
/// the hard gates are re-checked here as of the sign-off time; a candidate that lost its
/// <c>paid_amplification</c> grant in the interim is excluded and never signed off.</para>
/// </summary>
public sealed class SignoffService(GateBEventEmitter emitter)
{
    public async Task<SignoffResult> SignOffAsync(
        Guid allocationId,
        Guid tenantId,
        string reviewerId,
        DateTimeOffset signedOffAt,
        IReadOnlyList<string> modifications,
        LivePostFacts facts,
        IReadOnlyList<RightsGrant> grants,
        ProvenanceGateResult provenance,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(reviewerId))
            throw new ArgumentException("Sign-off requires a named human reviewer (REQ-037).", nameof(reviewerId));

        // Re-run the Gate B hard gates as of sign-off time — the gate runs twice.
        var reChecked = HardGates.Evaluate(facts, grants, provenance, signedOffAt);
        if (reChecked.Excluded)
            return new SignoffResult(SignedOff: false, EventId: null, reChecked);

        var eventId = await emitter.EmitAmplificationSignedOffAsync(
            allocationId, tenantId, reviewerId, signedOffAt, modifications, ct);

        return new SignoffResult(SignedOff: true, eventId, reChecked);
    }
}
