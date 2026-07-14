using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;

namespace UgcIntelligence.C2.Host;

/// <summary>
/// Phase R4a, retained in R4b as the <strong>unconfigured-C3 fallback</strong>. The real transport —
/// <see cref="HttpBreakerReaderClient"/> — is wired whenever <c>C3:CalibrationBaseAddress</c> is set. When
/// it is not, this stub stands in for an <em>unreachable C3</em>, because a host with no configured referee
/// must fail closed, not open — an unreachable referee is never permission.
///
/// <para>It does not decide anything and holds no breaker state. It signals "C3 unreachable" by throwing,
/// which is exactly the condition <see cref="UgcIntelligence.C2.Api.Breaker.BreakerCache"/> converts to a
/// fail-closed <c>cold</c> reading (rule 4). Wiring it through the real cache — rather than returning
/// <c>cold</c> directly — means the production fail-closed path is the one exercised at runtime, not a
/// host-local shortcut around it. No config, flag, or campaign exemption turns this into permission.</para>
/// </summary>
internal sealed class FailClosedBreakerClient : IBreakerReader
{
    public Task<BreakerReading> ReadAsync(CohortKey cohort, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        throw new C3TransportUnbuiltException();
    }
}

/// <summary>No C3 calibration base address is configured, so there is no referee to read. Surfaces as breaker <c>cold</c>.</summary>
internal sealed class C3TransportUnbuiltException()
    : InvalidOperationException(
        "No C3 calibration endpoint is configured (C3:CalibrationBaseAddress). C3 is treated as unreachable; " +
        "the breaker fails closed to cold. This is never a default that permits scoring or approval.");
