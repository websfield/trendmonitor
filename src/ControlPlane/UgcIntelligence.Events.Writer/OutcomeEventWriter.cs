namespace UgcIntelligence.Events.Writer;

/// <summary>
/// Contract B: <strong>C2 is the sole OutcomeEvent writer.</strong>
///
/// <para>This interface — and the assembly it lives in — is referenced by
/// <c>UgcIntelligence.C2.Api</c> and by nothing else. C1 and C3 are consumers; if C1 needed to
/// tell C2 something, the design is wrong, because C1's only output is Contract A.</para>
/// </summary>
public interface IOutcomeEventWriter
{
    /// <summary>
    /// Idempotent. A duplicate <c>idempotency_key</c> returns the original event id and appends nothing.
    /// If the append fails, the caller sees the failure: <strong>never silently drop an outcome</strong>,
    /// and never issue a verdict or commit an allocation whose event was dropped.
    /// </summary>
    Task<Guid> AppendAsync(OutcomeEvent e, CancellationToken ct = default);
}

public sealed class OutcomeEventWriter(AppendOnlyEventLog log) : IOutcomeEventWriter
{
    public Task<Guid> AppendAsync(OutcomeEvent e, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        return Task.FromResult(log.Append(e));
    }
}
