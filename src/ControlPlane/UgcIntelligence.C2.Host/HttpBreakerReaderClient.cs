using System.Text.Json;
using System.Text.Json.Serialization;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;

namespace UgcIntelligence.C2.Host;

/// <summary>
/// R4b-T4 (audit #3, breaker transport). The real cross-process Contract-C reader: C2's HTTP client to
/// C3's calibration API (<c>GET /api/calibration/{vertical}/{platform}</c>). It replaces R4a's
/// <see cref="FailClosedBreakerClient"/> seam wherever a C3 base address is configured.
///
/// <para><strong>It lives in the host, not in C2.Api, on purpose.</strong> C2's deterministic core holds no
/// <c>System.Net.Http</c> surface at all (ReferenceGraphTests: "there is no code path from a scoring request
/// into the Pattern Engine"). The transport is a host concern; the only breaker type C2.Api sees is the
/// <see cref="IBreakerReader"/> contract, which this client satisfies. It is wrapped by
/// <c>BreakerCache</c>, so the 60 s TTL and the fail-closed cache path stay exactly where they were.</para>
///
/// <para><strong>Fail closed, every branch (Rule 4).</strong> An unreachable C3, a non-success status, an
/// unparseable body, an unknown state token, or a reading whose <c>as_of</c> is already older than the TTL
/// all resolve to <c>cold</c> — never a last-known-<c>armed</c>, never a default numeric score, never
/// permission. C2 reads the referee and obeys; it does not interpret, and there is no config that turns an
/// unreachable referee into an approval.</para>
/// </summary>
public sealed class HttpBreakerReaderClient : IBreakerReader
{
    /// <summary>A reading whose own <c>as_of</c> is older than this is stale, and stale is cold — not its last value.</summary>
    public static readonly TimeSpan StaleAfter = TimeSpan.FromSeconds(60);

    /// <summary>
    /// The clock skew tolerated on a reading dated ahead of <c>now</c>. A reading stamped further into the
    /// future than this — clock skew, or a mis-stamped C3 reading — is not trusted as fresh: it is stale
    /// too. The staleness window is symmetric, so an <c>armed</c> reading dated ahead of us can never buy
    /// permission it has not earned.
    /// </summary>
    public static readonly TimeSpan FutureSkewTolerance = TimeSpan.FromSeconds(5);

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient _http;
    private readonly TimeProvider _clock;

    /// <param name="http">An <see cref="HttpClient"/> whose <c>BaseAddress</c> is C3's calibration API.</param>
    /// <param name="clock">Injectable for testing the staleness window; defaults to the system clock.</param>
    public HttpBreakerReaderClient(HttpClient http, TimeProvider? clock = null)
    {
        _http = http;
        _clock = clock ?? TimeProvider.System;
    }

    public async Task<BreakerReading> ReadAsync(CohortKey cohort, CancellationToken ct = default)
    {
        var now = _clock.GetUtcNow();
        try
        {
            var path = $"api/calibration/{Uri.EscapeDataString(cohort.Vertical)}/{Uri.EscapeDataString(cohort.Platform)}";
            using var response = await _http.GetAsync(path, ct);
            if (!response.IsSuccessStatusCode)
                return BreakerReading.ColdReading($"c3_http_{(int)response.StatusCode}_fail_closed", now);

            var body = await response.Content.ReadAsStringAsync(ct);

            CalibrationWire? view;
            try { view = JsonSerializer.Deserialize<CalibrationWire>(body, Options); }
            catch (JsonException) { return BreakerReading.ColdReading("c3_unparseable_fail_closed", now); }

            if (view is null || string.IsNullOrWhiteSpace(view.BreakerState))
                return BreakerReading.ColdReading("c3_unparseable_fail_closed", now);

            if (!TryParseState(view.BreakerState, out var state))
                return BreakerReading.ColdReading($"c3_unknown_state_{view.BreakerState}_fail_closed", now);

            // A reading whose own as-of is already past the TTL is stale: fail closed, never last-known-armed.
            if (now - view.AsOf > StaleAfter)
                return BreakerReading.ColdReading("c3_reading_stale_fail_closed", now);

            // Symmetric skew clamp: a reading dated in the future beyond the tolerated skew is not "fresh"
            // either — it is a mis-stamped or clock-skewed reading. Trusting a future-dated `armed` would be
            // permission bought from a bad clock. Fail closed.
            if (view.AsOf - now > FutureSkewTolerance)
                return BreakerReading.ColdReading("c3_reading_future_dated_fail_closed", now);

            return new BreakerReading(state, view.Reason ?? "c3", view.N, view.Rho, view.SuspectedLeak, view.AsOf);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;   // a caller cancellation is not a C3 outage.
        }
        catch
        {
            // Unreachable, DNS failure, connection refused, timeout: an unreachable referee is never permission.
            return BreakerReading.ColdReading("c3_unreachable_fail_closed", now);
        }
    }

    private static bool TryParseState(string token, out BreakerState state)
    {
        switch (token.Trim().ToLowerInvariant())
        {
            case "armed": state = BreakerState.Armed; return true;
            case "tripped": state = BreakerState.Tripped; return true;
            case "cold": state = BreakerState.Cold; return true;
            case "shadow": state = BreakerState.Shadow; return true;
            default: state = BreakerState.Cold; return false;   // unknown token → fail closed
        }
    }

    /// <summary>
    /// The Contract-C read shape as it crosses the wire (snake_case, per the project's cross-process
    /// convention). C2 defines its own view of the contract rather than referencing C3's assembly — C2
    /// depends on the contract, never on the referee.
    /// </summary>
    private sealed record CalibrationWire
    {
        [JsonPropertyName("breaker_state")] public string? BreakerState { get; init; }
        [JsonPropertyName("reason")] public string? Reason { get; init; }
        [JsonPropertyName("n")] public int N { get; init; }
        [JsonPropertyName("rho")] public decimal? Rho { get; init; }
        [JsonPropertyName("suspected_leak")] public bool SuspectedLeak { get; init; }
        [JsonPropertyName("as_of")] public DateTimeOffset AsOf { get; init; }
    }
}
