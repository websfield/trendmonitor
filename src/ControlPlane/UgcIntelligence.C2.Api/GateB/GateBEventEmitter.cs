using UgcIntelligence.Domain.Entities;
using UgcIntelligence.Domain.Provenance;
using UgcIntelligence.Events;
using UgcIntelligence.Events.Writer;

namespace UgcIntelligence.C2.Api.GateB;

/// <summary>
/// P5 emitters. C2 is the sole writer of the OutcomeEvent stream; these append the Gate B events through
/// the same <see cref="IOutcomeEventWriter"/>. <strong>Never commit money whose event was dropped</strong>:
/// if the append fails the exception propagates and the caller treats the allocation as not committed.
/// </summary>
public sealed class GateBEventEmitter(IOutcomeEventWriter writer)
{
    public async Task<Guid> EmitPostPublishedAsync(
        Guid submissionId, Guid tenantId, Guid livePostId, string platform,
        DateTimeOffset publishedAt, bool liveDisclosureVerified, CancellationToken ct = default)
    {
        var payload = new Dictionary<string, object?>
        {
            ["submission_id"] = submissionId,
            ["live_post_id"] = livePostId,
            ["published_at"] = publishedAt,
            ["platform"] = platform,
            ["live_disclosure_verified"] = liveDisclosureVerified,
        };
        return await AppendAsync(OutcomeEventType.PostPublished, submissionId, tenantId, publishedAt, payload, ct);
    }

    /// <summary>
    /// Emit a performance snapshot. It carries its named denominator, its series (organic and boosted are
    /// separate — never summed), its provenance, its true <c>as_of</c>, and the amplification
    /// <paramref name="arm"/> propagated from the allocation.
    /// </summary>
    public async Task<Guid> EmitPerformanceSnapshotAsync(
        PerformanceSnapshot snapshot, Guid tenantId, CancellationToken ct = default)
    {
        var r = snapshot.Rate;
        var payload = new Dictionary<string, object?>
        {
            ["live_post_id"] = snapshot.LivePostId,
            ["horizon"] = snapshot.Horizon.ToString().ToLowerInvariant(),
            ["engagement_rate"] = r.Value,
            ["denominator"] = r.Denominator.ToString().ToLowerInvariant(),
            ["series"] = r.Series.ToString().ToLowerInvariant(),
            ["provenance"] = ProvenanceToken(r.Provenance),
            ["as_of"] = r.AsOf,
            ["arm"] = snapshot.Arm is { } a ? a.ToString().ToLowerInvariant() : null,
        };
        return await AppendAsync(OutcomeEventType.PerformanceSnapshot, snapshot.LivePostId, tenantId, r.AsOf, payload, ct);
    }

    /// <summary>
    /// Emit an allocation. <c>rng_seed</c> and <c>sampler_version</c> are required (events-v1.json 1.2.0):
    /// the Thompson draw must be re-derivable from the log. The <c>arm</c> tag travels onward into every
    /// PerformanceSnapshot for this post.
    /// </summary>
    public async Task<Guid> EmitAmplificationAllocatedAsync(
        Allocation allocation, string samplerVersion, Guid tenantId, DateTimeOffset occurredAt, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(samplerVersion))
            throw new ArgumentException("sampler_version is required on AmplificationAllocated (1.2.0).", nameof(samplerVersion));

        var payload = new Dictionary<string, object?>
        {
            ["live_post_id"] = allocation.LivePostId,
            ["arm"] = allocation.Arm.ToString().ToLowerInvariant(),
            ["spend"] = allocation.Spend,
            ["aws"] = allocation.Aws,
            ["rationale"] = allocation.Rationale,
            ["epsilon"] = allocation.Epsilon.Value,
            ["rng_seed"] = allocation.RngSeed,
            ["sampler_version"] = samplerVersion,
            ["sampling_policy"] = PolicyToken(allocation.Policy),
            ["confidence_band"] = new[] { allocation.ConfidenceBand.Low, allocation.ConfidenceBand.High },
        };
        return await AppendAsync(OutcomeEventType.AmplificationAllocated, allocation.LivePostId, tenantId, occurredAt, payload, ct);
    }

    public async Task<Guid> EmitAmplificationSignedOffAsync(
        Guid allocationId, Guid tenantId, string reviewerId, DateTimeOffset signedOffAt,
        IReadOnlyList<string> modifications, CancellationToken ct = default)
    {
        var payload = new Dictionary<string, object?>
        {
            ["allocation_id"] = allocationId,
            ["reviewer_id"] = reviewerId,
            ["signed_off_at"] = signedOffAt,
            ["modifications"] = modifications,
        };
        return await AppendAsync(OutcomeEventType.AmplificationSignedOff, allocationId, tenantId, signedOffAt, payload, ct);
    }

    public async Task<Guid> EmitRightsGrantChangedAsync(
        Guid submissionId, Guid tenantId, RightsGrantType grantType, string change,
        string evidenceUri, DateTimeOffset occurredAt, CancellationToken ct = default)
    {
        var payload = new Dictionary<string, object?>
        {
            ["submission_id"] = submissionId,
            ["grant_type"] = GrantTypeToken(grantType),
            ["change"] = change,
            ["evidence_uri"] = evidenceUri,
        };
        return await AppendAsync(OutcomeEventType.RightsGrantChanged, submissionId, tenantId, occurredAt, payload, ct);
    }

    private async Task<Guid> AppendAsync(
        OutcomeEventType type, Guid entityId, Guid tenantId, DateTimeOffset occurredAt,
        IReadOnlyDictionary<string, object?> payload, CancellationToken ct)
    {
        var e = new OutcomeEvent(
            EventId: Guid.NewGuid(),
            EventType: type,
            IdempotencyKey: OutcomeEvent.ComputeIdempotencyKey(type, entityId, occurredAt),
            TenantId: tenantId,
            OccurredAt: occurredAt,
            RecordedAt: DateTimeOffset.UtcNow,
            Payload: payload);
        return await writer.AppendAsync(e, ct);
    }

    private static string ProvenanceToken(Provenance p) => p switch
    {
        Provenance.Measured => "Measured",
        Provenance.UserProvided => "User-provided",
        Provenance.Proxy => "Proxy",
        _ => throw new ArgumentOutOfRangeException(nameof(p), p, "A snapshot's provenance must be Measured, User-provided, or Proxy."),
    };

    private static string PolicyToken(SamplingPolicy p) => p switch
    {
        SamplingPolicy.ProportionalExploit => "proportional_exploit",
        SamplingPolicy.Thompson => "thompson",
        SamplingPolicy.UniformRandomNoBaseline => "uniform_random_no_baseline",
        _ => throw new ArgumentOutOfRangeException(nameof(p), p, null),
    };

    private static string GrantTypeToken(RightsGrantType t) => t switch
    {
        RightsGrantType.OrganicPublish => "organic_publish",
        RightsGrantType.PaidAmplification => "paid_amplification",
        RightsGrantType.WebsiteReuse => "website_reuse",
        RightsGrantType.EmailReuse => "email_reuse",
        RightsGrantType.Perpetuity => "perpetuity",
        _ => throw new ArgumentOutOfRangeException(nameof(t), t, null),
    };
}
