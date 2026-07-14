using System.Net;
using UgcIntelligence.C2.Host;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// R4b-T4, A-R4b-3. The real cross-process breaker transport: C2's HTTP client to C3's calibration API.
/// It returns a live state when C3 is up, and fails closed to <c>cold</c> on every failure path — an
/// unreachable C3, a non-success status, an unparseable body, an unknown state token, or a reading whose
/// own <c>as_of</c> is already past the 60 s TTL. An unreachable referee is never permission (Rule 4).
/// </summary>
public sealed class HttpBreakerClientTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-07-11T00:00:00Z");

    private static HttpBreakerReaderClient Client(HttpMessageHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("http://c3.calibration.test/") }, new TestClock(Now));

    private static string ArmedBody(DateTimeOffset asOf) =>
        $$"""{"vertical":"beauty","platform":"tiktok","breaker_state":"armed","reason":"armed_by=ops","n":80,"rho":0.42,"suspected_leak":false,"as_of":"{{asOf:O}}"}""";

    [Fact]
    public async Task ReturnsLiveState_WhenC3IsUp()
    {
        HttpRequestMessage? seen = null;
        var handler = new StubHandler(req =>
        {
            seen = req;
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(ArmedBody(Now.AddSeconds(-5))) };
        });

        var reading = await Client(handler).ReadAsync(Phase4Fixtures.Cohort());

        Assert.Equal(BreakerState.Armed, reading.State);
        Assert.Equal(80, reading.N);
        Assert.Equal(0.42m, reading.Rho);
        Assert.False(reading.SuspectedLeak);
        // The cohort's vertical/platform address the calibration resource.
        Assert.Equal("/api/calibration/beauty/tiktok", seen!.RequestUri!.AbsolutePath);
    }

    [Fact]
    public async Task Cold_WhenC3Unreachable()
    {
        var reading = await Client(new ThrowingHandler()).ReadAsync(Phase4Fixtures.Cohort());

        Assert.Equal(BreakerState.Cold, reading.State);
        Assert.Contains("unreachable", reading.Reason);
        Assert.Null(reading.Rho);   // no default numeric score
    }

    [Fact]
    public async Task Cold_WhenReadingIsStalePastTtl()
    {
        // C3 answers, but the reading's own as-of is older than the 60 s TTL: stale is cold, never last-known-armed.
        var handler = new StubHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(ArmedBody(Now.AddSeconds(-120))) });

        var reading = await Client(handler).ReadAsync(Phase4Fixtures.Cohort());

        Assert.Equal(BreakerState.Cold, reading.State);
        Assert.Contains("stale", reading.Reason);
    }

    [Fact]
    public async Task Cold_WhenReadingIsDatedInTheFuture()
    {
        // A reading stamped ahead of `now` beyond the tolerated skew is a mis-stamped or clock-skewed reading.
        // The staleness clamp is symmetric: a future-dated `armed` never buys permission from a bad clock.
        var handler = new StubHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(ArmedBody(Now.AddSeconds(120))) });

        var reading = await Client(handler).ReadAsync(Phase4Fixtures.Cohort());

        Assert.Equal(BreakerState.Cold, reading.State);
        Assert.Contains("future_dated", reading.Reason);
    }

    [Fact]
    public async Task Cold_WhenBodyUnparseable()
    {
        var handler = new StubHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("<html>not json</html>") });

        var reading = await Client(handler).ReadAsync(Phase4Fixtures.Cohort());

        Assert.Equal(BreakerState.Cold, reading.State);
        Assert.Contains("unparseable", reading.Reason);
    }

    [Fact]
    public async Task Cold_WhenNonSuccessStatus()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));

        var reading = await Client(handler).ReadAsync(Phase4Fixtures.Cohort());

        Assert.Equal(BreakerState.Cold, reading.State);
        Assert.Contains("503", reading.Reason);
    }

    [Fact]
    public async Task Cold_WhenStateTokenUnknown()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                $$"""{"breaker_state":"melted","reason":"garbage","n":80,"rho":0.42,"suspected_leak":false,"as_of":"{{Now:O}}"}"""),
        });

        var reading = await Client(handler).ReadAsync(Phase4Fixtures.Cohort());

        Assert.Equal(BreakerState.Cold, reading.State);
        Assert.Contains("unknown_state", reading.Reason);
    }

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(respond(request));
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            throw new HttpRequestException("connection refused (simulated C3 outage)");
    }
}
