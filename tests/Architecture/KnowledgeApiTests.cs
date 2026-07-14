using UgcIntelligence.Contracts.Mechanisms;
using UgcIntelligence.KnowledgeApi.Api;
using UgcIntelligence.KnowledgeApi.Resolution;
using UgcIntelligence.KnowledgeApi.Serving;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>A scriptable C4 artefact reader for store-down / stale simulations.</summary>
internal sealed class ScriptedMechanismReader(Func<string, string?> onResolve, Func<string, string> onRead) : IMechanismArtefactReader
{
    public string? ResolveActiveVersion(string key) => onResolve(key);
    public string Read(string sha256) => onRead(sha256);
}

/// <summary>P8-T9. C4 serving behaviour and failure modes.</summary>
public sealed class KnowledgeApiTests
{
    private const string Id = "33333333-3333-3333-3333-333333333333";

    /// <summary>C4_NoLibrary_200_Empty_WithCoverage. No active_version ⇒ 200, empty, coverage=no_library — not a 404.</summary>
    [Fact]
    public void C4_NoLibrary_200_Empty_WithCoverage()
    {
        using var store = new Phase8Fixtures.Store();   // nothing published
        var resp = store.Api.GetMechanisms("beauty", "tiktok");

        Assert.Equal(200, resp.Status);
        Assert.Empty(resp.Body!.Mechanisms);
        Assert.Equal("no_library", resp.Body.Coverage.State);
    }

    /// <summary>C4_BelowBar_NamesBlockingCounts. Only falsified/unratified present ⇒ 200, empty, below_warrant_bar + counts.</summary>
    [Fact]
    public void C4_BelowBar_NamesBlockingCounts()
    {
        using var store = new Phase8Fixtures.Store();
        var json = Phase8Fixtures.ManifestJson("beauty.tiktok.m1",
        [
            Phase8Fixtures.Mechanism(Id, warrant: "falsified"),
            Phase8Fixtures.Mechanism("44444444-4444-4444-4444-444444444444", warrant: "recurrent", ratified: false),
        ]);
        store.PublishManifest(json);

        var resp = store.Api.GetMechanisms("beauty", "tiktok");

        Assert.Equal(200, resp.Status);
        Assert.Empty(resp.Body!.Mechanisms);
        Assert.Equal("below_warrant_bar", resp.Body.Coverage.State);
        Assert.Contains("falsified: 1", resp.Body.Coverage.Blocking);
        Assert.Contains("blocked_unratified: 1", resp.Body.Coverage.Blocking);
    }

    /// <summary>C4_CorpusStale_SurfacedNotHidden. Corpus &gt; 30 days old ⇒ corpus_stale, mechanisms still served.</summary>
    [Fact]
    public void C4_CorpusStale_SurfacedNotHidden()
    {
        using var store = new Phase8Fixtures.Store();
        var json = Phase8Fixtures.ManifestJson("beauty.tiktok.m1",
            [Phase8Fixtures.Mechanism(Id, warrant: "contrasted")],
            cutAt: Phase8Fixtures.Now.AddDays(-40));
        store.PublishManifest(json);

        var resp = store.Api.GetMechanisms("beauty", "tiktok");

        Assert.Equal("corpus_stale", resp.Body!.Coverage.State);
        Assert.Single(resp.Body.Mechanisms);   // still served, staleness surfaced not hidden
    }

    /// <summary>A12. A served mechanism carries warrant, provenance.label, never_tested_against, falsifier, version, sha256.</summary>
    [Fact]
    public void Served_CarriesAllRequiredFields()
    {
        using var store = new Phase8Fixtures.Store();
        store.PublishManifest(Phase8Fixtures.ManifestJson("beauty.tiktok.m1", [Phase8Fixtures.Mechanism(Id)]));

        var m = Assert.Single(store.Api.GetMechanisms("beauty", "tiktok").Body!.Mechanisms);

        Assert.Equal("contrasted", m.Warrant);
        Assert.Equal("Proxy-selected, Measured-evaluated", m.ProvenanceLabel);
        Assert.Equal("content that was attempted and failed", m.NeverTestedAgainst);
        Assert.False(string.IsNullOrWhiteSpace(m.Falsifier));
        Assert.Equal("beauty.tiktok.m1", m.MechanismLibraryVersion);
        Assert.False(string.IsNullOrWhiteSpace(m.Sha256));
    }

    /// <summary>A16 serve-time checkpoint. A ratified statement using a forbidden verb is not served.</summary>
    [Fact]
    public void ForbiddenVerb_NotServed_EvenIfRatified()
    {
        using var store = new Phase8Fixtures.Store();
        store.PublishManifest(Phase8Fixtures.ManifestJson("beauty.tiktok.m1",
        [
            Phase8Fixtures.Mechanism(Id, statement: "A first-person hook predicts the scroll stop."),  // forbidden 'predicts'
        ]));

        Assert.Empty(store.Api.GetMechanisms("beauty", "tiktok").Body!.Mechanisms);
        Assert.Equal(404, store.Api.GetMechanism("beauty", "tiktok", Id).Status);   // not servable by id either
    }

    /// <summary>
    /// A16 serve-time checkpoint, on the falsifier. The falsifier is a served field too, so a ratified
    /// mechanism whose falsifier carries a forbidden verb is not served — same rule as the statement.
    /// </summary>
    [Fact]
    public void ForbiddenVerbInFalsifier_NotServed()
    {
        using var store = new Phase8Fixtures.Store();
        var m = Phase8Fixtures.Mechanism(Id);   // clean, ratified, contrasted statement...
        m["falsifier"] = "The mechanism is sunk if the hook no longer drives the scroll stop on a disjoint slice.";  // ...but 'drives' in the falsifier

        store.PublishManifest(Phase8Fixtures.ManifestJson("beauty.tiktok.m1", [m]));

        Assert.Empty(store.Api.GetMechanisms("beauty", "tiktok").Body!.Mechanisms);
        Assert.Equal(404, store.Api.GetMechanism("beauty", "tiktok", Id).Status);
    }

    /// <summary>A10. An unratified mechanism is never served, and there is no parameter that serves it.</summary>
    [Fact]
    public void Unratified_NeverServed()
    {
        using var store = new Phase8Fixtures.Store();
        store.PublishManifest(Phase8Fixtures.ManifestJson("beauty.tiktok.m1",
            [Phase8Fixtures.Mechanism(Id, warrant: "contrasted", ratified: false)]));

        Assert.Empty(store.Api.GetMechanisms("beauty", "tiktok").Body!.Mechanisms);
        Assert.Equal(404, store.Api.GetMechanism("beauty", "tiktok", Id).Status);
    }

    /// <summary>C4_HashMismatch_RefusesAndAlarmsP1. A mutated artefact is refused; the previous verified is served; P1.</summary>
    [Fact]
    public void C4_HashMismatch_RefusesAndAlarmsP1()
    {
        using var store = new Phase8Fixtures.Store();
        var sha = store.PublishManifest(Phase8Fixtures.ManifestJson("beauty.tiktok.m1", [Phase8Fixtures.Mechanism(Id)]));

        // First resolution verifies and caches the good version.
        Assert.Single(store.Api.GetMechanisms("beauty", "tiktok").Body!.Mechanisms);

        // Mutate the immutable artefact's bytes; the active pointer still points at its (now-wrong) sha.
        store.MutateArtefact(sha, Phase8Fixtures.ManifestJson("beauty.tiktok.m1",
            [Phase8Fixtures.Mechanism(Id, statement: "tampered")]));

        var resp = store.Api.GetMechanisms("beauty", "tiktok");
        Assert.Equal(200, resp.Status);                          // previous verified served, not a bare 500
        Assert.Single(resp.Body!.Mechanisms);
        Assert.Contains("P1", resp.Body.Coverage.Alarm!);        // alarmed as P1
        Assert.NotNull(resp.Body.Coverage.StaleAsOf);
    }

    /// <summary>C4_StoreDown_ServesStale. Store goes unreachable after a good read ⇒ serve the stale cache, stamped.</summary>
    [Fact]
    public void C4_StoreDown_ServesStale()
    {
        var good = Phase8Fixtures.ManifestJson("beauty.tiktok.m1", [Phase8Fixtures.Mechanism(Id)]);
        var down = false;
        var reader = new ScriptedMechanismReader(
            _ => down ? throw new MechanismStoreUnreachableException("down") : "sha1",
            _ => down ? throw new MechanismStoreUnreachableException("down") : good);
        var api = new KnowledgeApiEndpoints(reader, new TestClock(Phase8Fixtures.Now));

        Assert.Single(api.GetMechanisms("beauty", "tiktok").Body!.Mechanisms);   // prime the cache
        down = true;

        var resp = api.GetMechanisms("beauty", "tiktok");
        Assert.Equal(200, resp.Status);                          // stale served, never a bare 500
        Assert.Single(resp.Body!.Mechanisms);
        Assert.NotNull(resp.Body.Coverage.StaleAsOf);
    }

    /// <summary>C4_StoreDown_NoCache_AlarmsWithReason. Store unreachable + no cache ⇒ 503 with a reason, never a bare 500.</summary>
    [Fact]
    public void C4_StoreDown_NoCache_AlarmsWithReason()
    {
        var reader = new ScriptedMechanismReader(
            _ => throw new MechanismStoreUnreachableException("connection refused"),
            _ => throw new MechanismStoreUnreachableException("connection refused"));
        var api = new KnowledgeApiEndpoints(reader, new TestClock(Phase8Fixtures.Now));

        var resp = api.GetMechanisms("beauty", "tiktok");
        Assert.Equal(503, resp.Status);
        Assert.NotEqual(500, resp.Status);
        Assert.Contains("store_unreachable", resp.Reason!);
    }

    /// <summary>DeletedPost_CountsSurvive_UriUnresolvable. A deleted post's URI is unresolvable; its boolean survives.</summary>
    [Fact]
    public void DeletedPost_CountsSurvive_UriUnresolvable()
    {
        using var store = new Phase8Fixtures.Store();
        var indexJson = Phase8Fixtures.ExemplarIndexJson(Id, Phase8Fixtures.Exemplar("https://tiktok/dead", deleted: true));
        var indexSha = store.PublishArtefact(indexJson);
        store.PublishManifest(Phase8Fixtures.ManifestJson("beauty.tiktok.m1", [Phase8Fixtures.Mechanism(Id)], exemplarIndexUri: indexSha));

        var ex = Assert.Single(store.Api.GetExemplars("beauty", "tiktok", Id).Body!);
        Assert.Equal("unresolvable", ex.UriStatus);
        Assert.True(ex.PredicateSatisfied);     // the count survives the post's deletion
    }

    /// <summary>NoRedistribute_CountsOnly. A no-redistribute source ⇒ the URI is withheld, the boolean survives.</summary>
    [Fact]
    public void NoRedistribute_CountsOnly()
    {
        using var store = new Phase8Fixtures.Store();
        var indexJson = Phase8Fixtures.ExemplarIndexJson(Id, Phase8Fixtures.Exemplar("https://tiktok/x", redistributable: false));
        var indexSha = store.PublishArtefact(indexJson);
        store.PublishManifest(Phase8Fixtures.ManifestJson("beauty.tiktok.m1", [Phase8Fixtures.Mechanism(Id)], exemplarIndexUri: indexSha));

        var ex = Assert.Single(store.Api.GetExemplars("beauty", "tiktok", Id).Body!);
        Assert.Null(ex.PublicPostUri);          // URI withheld
        Assert.Equal("withheld_no_redistribute", ex.UriStatus);
        Assert.True(ex.PredicateSatisfied);     // the count still leaves
    }

    /// <summary>/history shows the mechanism's warrant transitions across versions, each with its corpus snapshot.</summary>
    [Fact]
    public void History_WalksSupersedesChain()
    {
        using var store = new Phase8Fixtures.Store();
        // m1 (contrasted) superseded by m2 (falsified) — the demotion is visible on /history.
        var m1 = Phase8Fixtures.ManifestJson("beauty.tiktok.m1", [Phase8Fixtures.Mechanism(Id, warrant: "contrasted")]);
        var m1Sha = store.PublishArtefact(m1);
        store.Writer.RepointActiveVersion(UgcIntelligence.Artefacts.ArtefactStore.MechanismsPrefix, "beauty.tiktok.m1", m1Sha);

        var m2 = Phase8Fixtures.ManifestJson("beauty.tiktok.m2", [Phase8Fixtures.Mechanism(Id, warrant: "falsified")], supersedes: "beauty.tiktok.m1");
        store.PublishManifest(m2);

        var history = store.Api.GetHistory("beauty", "tiktok", Id).Body!;
        Assert.Equal(2, history.Count);
        Assert.Equal("falsified", history[0].Warrant);   // newest first
        Assert.Equal("contrasted", history[1].Warrant);
    }
}
