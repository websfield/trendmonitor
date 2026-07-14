using System.Text.Json;
using System.Text.Json.Serialization;

namespace UgcIntelligence.KnowledgeApi.Serving;

/// <summary>
/// One exemplar grounding a mechanism, as stored in the exemplar-index artefact. <strong>It carries a URI,
/// an observation date, and a predicate-satisfaction boolean — and nothing else (REQ-069).</strong> There is
/// no creator handle, no frame, no transcript, no face, no extracted personal information: the counts are an
/// observation about an artefact; the personal information stays behind and never enters C4's process.
/// </summary>
public sealed record ExemplarRecord(
    string PublicPostUri,
    string ObservedAt,
    bool PredicateSatisfied,
    bool Redistributable = true,
    bool Deleted = false);

/// <summary>
/// The exemplar index for a library — mechanism id → its grounding exemplars. Referenced by the manifest's
/// <c>exemplar_index_uri</c> and read from the same one artefact-store prefix; C4 acquires no second grant.
/// </summary>
public sealed record ExemplarIndex(IReadOnlyDictionary<string, IReadOnlyList<ExemplarRecord>> ByMechanismId)
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
    };

    public static ExemplarIndex Parse(string json)
    {
        var map = JsonSerializer.Deserialize<Dictionary<string, List<ExemplarRecord>>>(json, Options) ?? [];
        return new ExemplarIndex(map.ToDictionary(kv => kv.Key, kv => (IReadOnlyList<ExemplarRecord>)kv.Value));
    }

    public IReadOnlyList<ExemplarRecord> For(string mechanismId) =>
        ByMechanismId.TryGetValue(mechanismId, out var list) ? list : [];
}
