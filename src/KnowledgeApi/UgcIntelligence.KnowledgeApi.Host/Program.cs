using UgcIntelligence.Artefacts;
using UgcIntelligence.Contracts.Mechanisms;
using UgcIntelligence.KnowledgeApi.Api;
using UgcIntelligence.KnowledgeApi.Resolution;

// Phase R4a (audit #3/#7). The C4 host: a distinct executable that runs the Knowledge API's existing
// read-only serving logic. It writes NO new decision logic — endpoints delegate to KnowledgeApiEndpoints.
//
// Boundaries this composition root preserves (ADR-0007 §1/§5/§6):
//   * ONE artefact-store prefix, read-only. The reader is a PrefixScopedReader bound to the mechanism
//     prefix; a second prefix throws. "If C4 ever needs a second data source, the design is wrong."
//   * It writes nothing, emits no events, reads no breaker. No event log or breaker type is registered
//     here because none is referenced — the host-separation test proves it.
//   * It does not share a process with C1: this is its own executable.

var builder = WebApplication.CreateBuilder(args);

// The one read grant. The artefact-store root is non-secret local/config path (env or appsettings).
var artefactRoot = builder.Configuration["ArtefactStore:Root"]
    ?? Path.Combine(AppContext.BaseDirectory, "artefacts");

// One prefix, read-only. There is no write, no repoint, and no path to a second prefix on this reader.
var prefixReader = ArtefactStore.OpenPrefix(artefactRoot, ArtefactStore.MechanismsPrefix);
builder.Services.AddSingleton<IMechanismArtefactReader>(new PrefixScopedMechanismReader(prefixReader));
builder.Services.AddSingleton(sp => new KnowledgeApiEndpoints(sp.GetRequiredService<IMechanismArtefactReader>()));

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    component = "C4",
    read_grant = ArtefactStore.MechanismsPrefix,
}));

// GET /api/knowledge/mechanisms — a cohort with no artefact returns 200 + coverage.state (NoLibrary),
// never a 500. Emptiness is honest coverage, never an absence of structure.
app.MapGet("/api/knowledge/mechanisms",
    (string vertical, string platform, string? warrant, KnowledgeApiEndpoints api) =>
    {
        Warrant? filter = warrant is null ? null : ParseWarrant(warrant);
        var response = api.GetMechanisms(vertical, platform, filter);
        return response.Status == 200
            ? Results.Ok(response.Body)
            : Results.Json(new { reason = response.Reason }, statusCode: response.Status);
    });

app.Run();

static Warrant? ParseWarrant(string token) =>
    Enum.TryParse<Warrant>(token, ignoreCase: true, out var w) ? w : null;

/// <summary>Exposed so WebApplicationFactory-based tests can boot the C4 host in-process.</summary>
public partial class Program;
