using UgcIntelligence.C2.Api.Breaker;
using UgcIntelligence.C2.Api.Events;
using UgcIntelligence.C2.Api.Scoring;
using UgcIntelligence.C2.Host;
using UgcIntelligence.C2.Api.Verdicts;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;
using UgcIntelligence.Events;
using UgcIntelligence.Events.Writer;

// Phase R4a (audit #3/#7). The C2 host: a distinct executable that runs C2's existing deterministic
// class-library logic. It writes NO new decision logic — every endpoint delegates to an existing C2 type.
//
// Boundaries this composition root preserves (ADR-0007 §6, CLAUDE.md non-negotiables 2/3/4):
//   * C2 is the SOLE OutcomeEvent writer — the writer is wired here and nowhere else in the graph.
//   * The breaker read is FAIL-CLOSED: the R4b transport stub is unreachable, so BreakerCache returns
//     cold and VPS stays advisory. There is no config that turns an unreachable referee into permission.
//   * NO auto-approval endpoint exists. Approval lives in ApprovalService, which demands a human click.
//   * No C1 assembly and no KnowledgeApi (C4) assembly is referenced; no Mechanism type is in scope.

var builder = WebApplication.CreateBuilder(args);

// --- Sole event writer (Contract B). Registered once, in the one host that is allowed to write. --------
builder.Services.AddSingleton<AppendOnlyEventLog>();
builder.Services.AddSingleton<IOutcomeEventWriter>(sp => new OutcomeEventWriter(sp.GetRequiredService<AppendOnlyEventLog>()));
builder.Services.AddSingleton(sp => new ComplianceEventEmitter(sp.GetRequiredService<IOutcomeEventWriter>()));

// --- Approval authority. No auto-approve: RecordHumanApprovalAsync requires a real human_approved_at. ---
builder.Services.AddSingleton(sp => new ApprovalService(sp.GetRequiredService<ComplianceEventEmitter>()));

// --- Contract C, fail-closed (Phase R4b). The upstream reader is the real HTTP client to C3's
//     calibration API when a base address is configured; otherwise the FailClosedBreakerClient stub
//     stands in (no transport configured is treated as an unreachable referee). Either way the
//     IBreakerReader C2 obeys is the BreakerCache — the 60 s TTL and fail-closed path stay put, and an
//     unreachable or unconfigured C3 resolves to cold, never to permission. -----------------------------
var c3BaseAddress = builder.Configuration["C3:CalibrationBaseAddress"];
if (!string.IsNullOrWhiteSpace(c3BaseAddress))
{
    // A single long-lived HttpClient for the calibration read. This is a read-only Contract-C link; C2
    // holds no write path to breaker state.
    builder.Services.AddSingleton<IBreakerReader>(_ =>
        new BreakerCache(new HttpBreakerReaderClient(new HttpClient { BaseAddress = new Uri(c3BaseAddress) })));
}
else
{
    builder.Services.AddSingleton<FailClosedBreakerClient>();
    builder.Services.AddSingleton<IBreakerReader>(sp => new BreakerCache(sp.GetRequiredService<FailClosedBreakerClient>()));
}

var app = builder.Build();

// Liveness. Names the component and the honest transport state so an operator is not misled (RUNBOOK).
app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    component = "C2",
    breaker_transport = string.IsNullOrWhiteSpace(c3BaseAddress) ? "fail_closed_no_c3_configured" : "http_client_to_c3",
}));

// The advisory breaker read. With C3 unreachable (R4b unbuilt) this always resolves to cold: VPS is
// advisory, never anchored, and nothing here approves anything. This is the fail-closed demonstration.
app.MapGet("/api/breaker/{tenantId:guid}/{vertical}/{platform}/{rubricVersion}/{patternLibraryVersion}",
    async (Guid tenantId, string vertical, string platform, string rubricVersion, string patternLibraryVersion,
           IBreakerReader breaker, CancellationToken ct) =>
    {
        var cohort = new CohortKey(tenantId, vertical, platform, rubricVersion, patternLibraryVersion);
        var reading = await breaker.ReadAsync(cohort, ct);
        return Results.Ok(new
        {
            state = reading.StateToken,     // "cold" while C3 is unreachable — advisory, not permission
            reason = reading.Reason,
            n = reading.N,
            rho = reading.Rho,
            advisory = reading.State != BreakerState.Armed,
        });
    });

// R4b-T7 (audit #21). The scoring-content load site: the point creator media text enters the process.
// Caption/transcript/on-screen text are marked Untrusted<string> the instant they cross the boundary,
// BEFORE any code can hand them to a prompt (Rule 1). This endpoint assembles a fenced prompt
// deterministically and returns only a confirmation — it does NOT call a model (no live LLM in scope),
// and it never echoes the untrusted content back.
app.MapPost("/api/score/prepare-prompt", (ScorePromptRequest request) =>
{
    var content = ScoringContentIntake.FromTransport(request.Transcript, request.OnscreenText, request.Caption);
    var prompt = content.BuildFencedPrompt(
        instructions: "Score the submission for craft against the rubric.",
        trustedContext: request.TrustedContext ?? []);

    return Results.Ok(new
    {
        fenced = true,             // the three creator fields entered as Untrusted and were fenced
        blocks = 3,
        prompt_length = prompt.Text.Length,
    });
});

app.Run();

/// <summary>
/// The scoring-endpoint request body: raw transport strings, accepted only at the load site where they are
/// immediately marked <c>Untrusted&lt;string&gt;</c> via <see cref="ScoringContentIntake.FromTransport"/>.
/// </summary>
internal sealed record ScorePromptRequest(
    string? Transcript,
    string? OnscreenText,
    string? Caption,
    IReadOnlyList<string>? TrustedContext);

/// <summary>Exposed so WebApplicationFactory-based tests can boot the C2 host in-process.</summary>
public partial class Program;
