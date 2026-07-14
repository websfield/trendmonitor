using UgcIntelligence.Artefacts;
using UgcIntelligence.Contracts.Mechanisms;
using UgcIntelligence.KnowledgeApi.Resolution;
using UgcIntelligence.KnowledgeApi.Serving;

namespace UgcIntelligence.KnowledgeApi.Api;

/// <summary>
/// P8-T9. Component 4, the Knowledge API. <strong>Read-only, GET-only, one artefact-store prefix.</strong>
/// It writes nothing, calls nothing, reads no breaker, and emits no events. It resolves published mechanism
/// libraries from the mechanism prefix, filters to ratified served-rung lexicon-clean mechanisms, and
/// composes responses that carry warrant, provenance, falsifier, version, and sha256 — and no magnitude.
///
/// <para>These handlers are the five GET endpoints of §4.5; a thin ASP.NET host maps routes onto them. There
/// is no handler that writes — the type has no such method, by design, not by omission.</para>
/// </summary>
public sealed class KnowledgeApiEndpoints(IMechanismArtefactReader reader, TimeProvider? clock = null)
{
    private readonly IMechanismArtefactReader _reader = reader;
    private readonly MechanismResolver _resolver = new(reader, clock);
    private readonly ResponseComposer _composer = new(clock);

    /// <summary><c>GET /api/knowledge/mechanisms?vertical=&amp;platform=&amp;warrant=</c></summary>
    public KnowledgeResponse<MechanismCollection> GetMechanisms(string vertical, string platform, Warrant? warrant = null)
    {
        var result = _resolver.Resolve(vertical, platform);
        if (IsUnavailable(result, out var reason))
            return KnowledgeResponse<MechanismCollection>.Unavailable(reason!);

        return KnowledgeResponse<MechanismCollection>.Ok(_composer.ComposeCollection(result, warrant));
    }

    /// <summary><c>GET /api/knowledge/mechanisms/{id}</c> — served only if ratified, served-rung, lexicon-clean.</summary>
    public KnowledgeResponse<MechanismView> GetMechanism(string vertical, string platform, string id)
    {
        var result = _resolver.Resolve(vertical, platform);
        if (IsUnavailable(result, out var reason))
            return KnowledgeResponse<MechanismView>.Unavailable(reason!);
        if (result.Library is not { } lib)
            return KnowledgeResponse<MechanismView>.NotFound("no library for this cohort");

        var m = lib.Mechanisms.FirstOrDefault(x => x.Id == id);
        if (m is null || !WarrantFilter.IsServed(m))
            return KnowledgeResponse<MechanismView>.NotFound("no served mechanism with this id");

        return KnowledgeResponse<MechanismView>.Ok(ResponseComposer.Compose(m, lib));
    }

    /// <summary><c>GET /api/knowledge/mechanisms/{id}/exemplars</c> — public post URIs + booleans only, never PII.</summary>
    public KnowledgeResponse<IReadOnlyList<ExemplarView>> GetExemplars(string vertical, string platform, string id)
    {
        var result = _resolver.Resolve(vertical, platform);
        if (IsUnavailable(result, out var reason))
            return KnowledgeResponse<IReadOnlyList<ExemplarView>>.Unavailable(reason!);
        if (result.Library is not { } lib)
            return KnowledgeResponse<IReadOnlyList<ExemplarView>>.NotFound("no library for this cohort");

        var m = lib.Mechanisms.FirstOrDefault(x => x.Id == id);
        if (m is null || !WarrantFilter.IsServed(m))
            return KnowledgeResponse<IReadOnlyList<ExemplarView>>.NotFound("no served mechanism with this id");

        if (lib.ExemplarIndexUri is not { } indexSha)
            return KnowledgeResponse<IReadOnlyList<ExemplarView>>.Ok([]);

        string indexJson;
        try
        {
            indexJson = _reader.Read(indexSha);
        }
        catch (ArtefactHashMismatchException ex)
        {
            return KnowledgeResponse<IReadOnlyList<ExemplarView>>.Unavailable(ex.Message);
        }
        catch (MechanismStoreUnreachableException ex)
        {
            return KnowledgeResponse<IReadOnlyList<ExemplarView>>.Unavailable(ex.Message);
        }

        var records = ExemplarIndex.Parse(indexJson).For(id);
        return KnowledgeResponse<IReadOnlyList<ExemplarView>>.Ok(ResponseComposer.ComposeExemplars(records));
    }

    /// <summary><c>GET /api/knowledge/mechanisms/{id}/history</c> — warrant transitions, each with the causing snapshot.</summary>
    public KnowledgeResponse<IReadOnlyList<WarrantTransitionView>> GetHistory(string vertical, string platform, string id)
    {
        var result = _resolver.Resolve(vertical, platform);
        if (IsUnavailable(result, out var reason))
            return KnowledgeResponse<IReadOnlyList<WarrantTransitionView>>.Unavailable(reason!);
        if (result.Library is null)
            return KnowledgeResponse<IReadOnlyList<WarrantTransitionView>>.NotFound("no library for this cohort");

        var transitions = new List<WarrantTransitionView>();
        var lib = result.Library;
        var seen = new HashSet<string>(StringComparer.Ordinal);

        // Walk the supersedes chain newest → oldest, recording this mechanism's warrant in each version.
        while (lib is not null && seen.Add(lib.MechanismLibraryVersion))
        {
            var m = lib.Mechanisms.FirstOrDefault(x => x.Id == id);
            if (m is not null)
                transitions.Add(new WarrantTransitionView(
                    lib.MechanismLibraryVersion, m.Warrant.ToSnake(), lib.CorpusSnapshotSha256, lib.PublishedAt));

            if (lib.Supersedes is not { } prev) break;
            lib = _resolver.ResolveByKey(prev).Library;
        }

        if (transitions.Count == 0)
            return KnowledgeResponse<IReadOnlyList<WarrantTransitionView>>.NotFound("this mechanism has no history in the resolved libraries");

        return KnowledgeResponse<IReadOnlyList<WarrantTransitionView>>.Ok(transitions);
    }

    /// <summary><c>GET /api/knowledge/libraries/{version}</c> — the immutable manifest, for reconstructing a past response.</summary>
    public KnowledgeResponse<MechanismCollection> GetLibrary(string version)
    {
        var result = _resolver.ResolveByKey(version);
        if (IsUnavailable(result, out var reason))
            return KnowledgeResponse<MechanismCollection>.Unavailable(reason!);
        if (result.Library is not { } lib)
            return KnowledgeResponse<MechanismCollection>.NotFound($"no library version {version}");

        // The manifest is returned in full (every rung) for reconstruction, each composed with its warrant.
        var views = lib.Mechanisms.Select(m => ResponseComposer.Compose(m, lib)).ToList();
        var served = lib.Mechanisms.Count(WarrantFilter.IsServed);
        var coverage = new Coverage(CoverageState.Served.ToSnake(), lib.MechanismLibraryVersion,
            lib.Mechanisms.Count, served, $"served: {served}; total: {lib.Mechanisms.Count}",
            null, null, null);
        return KnowledgeResponse<MechanismCollection>.Ok(new MechanismCollection(views, coverage, lib.MechanismLibraryVersion, lib.Sha256));
    }

    /// <summary>Refused/unreachable resolutions become 503 with a reason — never a bare 500.</summary>
    private static bool IsUnavailable(ResolveResult result, out string? reason)
    {
        if (result.Status is ResolveStatus.RefusedHashMismatch or ResolveStatus.StoreUnreachable)
        {
            reason = result.Alarm ?? "the mechanism library store is unavailable";
            return true;
        }
        reason = null;
        return false;
    }
}
