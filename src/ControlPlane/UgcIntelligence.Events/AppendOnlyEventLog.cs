using System.Collections.Concurrent;
using System.Text.Json;

namespace UgcIntelligence.Events;

/// <summary>
/// Append-only. <strong>There is no delete API</strong>, and there is no update. A correction is a
/// compensating event (<c>VerdictOverridden</c>), never a mutation.
///
/// <para>Deduplication is on <c>idempotency_key</c>: a duplicate append is a no-op returning the
/// original event id, not an error. At-least-once delivery is the contract, so duplicate delivery
/// is normal and consumers deduplicate.</para>
///
/// <para>This class is the store. The <em>write</em> capability lives in a separate assembly
/// (<c>UgcIntelligence.Events.Writer</c>) that only C2 references, which is what makes
/// "C2 is the sole OutcomeEvent writer" a reachability fact rather than a comment.</para>
/// </summary>
public sealed class AppendOnlyEventLog : IOutcomeEventReader
{
    private readonly ConcurrentDictionary<string, Guid> _byIdempotencyKey = new(StringComparer.Ordinal);
    private readonly List<OutcomeEvent> _events = [];
    private readonly Lock _gate = new();

    /// <summary>
    /// Internal by design: only <c>UgcIntelligence.Events.Writer</c> — referenced by C2 alone —
    /// can reach it. C1 and C3 get <see cref="IOutcomeEventReader"/> and nothing else.
    /// </summary>
    internal Guid Append(OutcomeEvent e)
    {
        lock (_gate)
        {
            if (_byIdempotencyKey.TryGetValue(e.IdempotencyKey, out var existing))
                return existing;                      // no-op, not an error

            _byIdempotencyKey[e.IdempotencyKey] = e.EventId;
            _events.Add(e);
            return e.EventId;
        }
    }

    public async IAsyncEnumerable<OutcomeEvent> ReplayAsync(
        Guid? tenantId = null,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        OutcomeEvent[] snapshot;
        lock (_gate) snapshot = [.. _events];

        foreach (var e in snapshot)
        {
            ct.ThrowIfCancellationRequested();
            if (tenantId is null || e.TenantId == tenantId) yield return e;
        }
        await Task.CompletedTask;
    }

    public int Count { get { lock (_gate) return _events.Count; } }

    /// <summary>
    /// The read-only NDJSON projection C1 and C3 consume. It projects the OutcomeEvent log —
    /// which Contract B already grants them — never ClientHub's operational tables. It offers
    /// no write path, which is why Python cannot become a second writer.
    ///
    /// <para><strong>Tenant-scoped, like <see cref="ReplayAsync"/>.</strong> An unscoped export
    /// would be a cross-tenant read path wearing a different name, and tenant outcome data never
    /// crosses tenants — no widening override, no admin path.</para>
    /// </summary>
    public string ToReplayExportNdjson(Guid tenantId)
    {
        lock (_gate)
            return string.Join('\n', _events.Where(e => e.TenantId == tenantId)
                                            .Select(e => JsonSerializer.Serialize(e, EventSerialization.Options)));
    }
}
