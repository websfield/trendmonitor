using UgcIntelligence.C3.Calibration.Api;
using UgcIntelligence.C3.Calibration.Breaker;
using UgcIntelligence.C3.Calibration.Calibration;
using UgcIntelligence.Contracts;
using UgcIntelligence.Domain;
using UgcIntelligence.Events;

// Phase R4a (audit #3/#7). The C3 host: a distinct executable that runs C3's existing calibration/breaker
// logic. It writes NO new decision logic — endpoints delegate to CalibrationApi/CalibrationMonitor.
//
// Boundaries this composition root preserves (ADR-0007 §6, ADR-0005, CLAUDE.md non-negotiable 3):
//   * READER-ONLY over the event log. AppendOnlyEventLog is registered as IOutcomeEventReader; the
//     append (write) method is internal to the Events assembly and granted only to Events.Writer, which
//     this host does not reference. C3 consumes Contract B; it never writes it.
//   * C3 is the SOLE breaker/library authority — BreakerStore/CalibrationMonitor live here, not in C2.
//   * No C2 assembly, no KnowledgeApi (C4) assembly, no Mechanism type is referenced.

var builder = WebApplication.CreateBuilder(args);

// --- Reader-only event-log grant (Contract B, consumer side). No writer is reachable from this host. ---
builder.Services.AddSingleton<AppendOnlyEventLog>();
builder.Services.AddSingleton<IOutcomeEventReader>(sp => sp.GetRequiredService<AppendOnlyEventLog>());

// --- Calibration seam (C3<->Python). Offline deterministic default until the real source is wired. -----
builder.Services.AddSingleton<ICalibrationSource>(_ => new OfflineCalibrationSource());

// --- Breaker authority. C3 alone trips/arms; the monitor is the IBreakerReader this host serves. -------
builder.Services.AddSingleton<BreakerStore>();
builder.Services.AddSingleton<IBreakerReader>(sp =>
    new CalibrationMonitor(sp.GetRequiredService<ICalibrationSource>(), sp.GetRequiredService<BreakerStore>()));
builder.Services.AddSingleton(sp =>
    new CalibrationApi(sp.GetRequiredService<ICalibrationSource>(), sp.GetRequiredService<IBreakerReader>()));

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { status = "ok", component = "C3", role = "breaker_and_library_authority" }));

// Contract C read surface: the client-facing calibration view for a cohort. Fixture-seeded cohorts
// return 404 (never client-facing); an unknown cohort resolves cold with n=0.
app.MapGet("/api/calibration/{vertical}/{platform}",
    async (string vertical, string platform, CalibrationApi calibration, CancellationToken ct) =>
    {
        // C3's client view keys on (vertical, platform); the remaining triple members are cohort-scoping
        // detail supplied by the caller in the full wiring (R4b). Here we resolve the cohort's breaker view.
        var cohort = new CohortKey(Guid.Empty, vertical, platform, RubricVersion: "", PatternLibraryVersion: "");
        var view = await calibration.GetAsync(cohort, ct);
        return view is null ? Results.NotFound() : Results.Ok(view);
    });

app.Run();

/// <summary>Exposed so WebApplicationFactory-based tests can boot the C3 host in-process.</summary>
public partial class Program;
