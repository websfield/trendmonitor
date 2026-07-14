using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;

namespace UgcIntelligence.Events;

/// <summary>
/// Contract B. The eight event types C2 emits. C1 and C3 consume; neither writes.
///
/// <para>Per <c>integration-contract.md</c> Contract B, <c>event_type</c> is the one wire value that
/// stays <strong>PascalCase</strong> — it names the event type in the shared enum
/// <c>c1_pattern_engine/corpora/internal.py</c> matches on (<c>"PostPublished"</c>, not
/// <c>"post_published"</c>). Each member therefore carries an explicit
/// <see cref="JsonStringEnumMemberName"/> that opts out of the assembly's snake_case naming policy,
/// so the shared <see cref="EventSerialization.Options"/> can still apply everywhere without
/// renaming these values.</para>
/// </summary>
public enum OutcomeEventType
{
    [JsonStringEnumMemberName("SubmissionScored")] SubmissionScored,
    [JsonStringEnumMemberName("VerdictIssued")] VerdictIssued,
    [JsonStringEnumMemberName("VerdictOverridden")] VerdictOverridden,
    [JsonStringEnumMemberName("PostPublished")] PostPublished,
    [JsonStringEnumMemberName("PerformanceSnapshot")] PerformanceSnapshot,
    [JsonStringEnumMemberName("AmplificationAllocated")] AmplificationAllocated,
    [JsonStringEnumMemberName("AmplificationSignedOff")] AmplificationSignedOff,
    [JsonStringEnumMemberName("RightsGrantChanged")] RightsGrantChanged,
}

/// <summary>
/// Contract B envelope. Append-only, at-least-once delivery, idempotency-keyed.
///
/// <para><strong>No event carries a raw media URI.</strong> Events reference
/// <c>feature_record_id</c> only, so that de-identification after the rights window closes
/// does not invalidate the log.</para>
/// </summary>
public sealed record OutcomeEvent(
    Guid EventId,
    OutcomeEventType EventType,
    string IdempotencyKey,
    Guid TenantId,
    DateTimeOffset OccurredAt,
    DateTimeOffset RecordedAt,
    IReadOnlyDictionary<string, object?> Payload)
{
    /// <summary>
    /// <c>hash(event_type, entity_id, logical_timestamp)</c>. Consumers dedupe on this.
    /// Duplicate delivery is normal; a double-counted outcome inflates an effect size, and
    /// effect sizes are what the whole system rests on.
    /// </summary>
    public static string ComputeIdempotencyKey(OutcomeEventType type, Guid entityId, DateTimeOffset logicalTimestamp)
    {
        var material = $"{type}|{entityId}|{logicalTimestamp.ToUniversalTime():O}";
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(material)));
    }
}

/// <summary>
/// The <em>only</em> interface C1 and C3 receive. Replay is a first-class operation, not a
/// recovery path: C1 rebuilds its entire internal corpus by replaying the log, which is what
/// makes an extractor version bump survivable.
/// </summary>
public interface IOutcomeEventReader
{
    IAsyncEnumerable<OutcomeEvent> ReplayAsync(Guid? tenantId = null, CancellationToken ct = default);
}
