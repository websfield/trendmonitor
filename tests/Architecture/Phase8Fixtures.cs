using System.Text.Json;
using UgcIntelligence.Artefacts;
using UgcIntelligence.Artefacts.Writer;
using UgcIntelligence.KnowledgeApi.Api;
using UgcIntelligence.KnowledgeApi.Resolution;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>Builds mechanism-library artefacts (mechanisms-v1.json shape) and wires a C4 KnowledgeApi over them.</summary>
internal static class Phase8Fixtures
{
    public static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-07-11T00:00:00Z");

    public static Dictionary<string, object?> Mechanism(
        string id, string warrant = "contrasted", bool ratified = true, string? statement = null,
        string ingestionArm = "trend_directed")
        => new()
        {
            ["id"] = id,
            ["statement"] = statement ?? "A first-person problem statement inside 1.2s holds the scroll where a product shot does not.",
            ["feature_predicate"] = new Dictionary<string, object?> { ["field"] = "hook_ms", ["op"] = "<", ["value"] = 1200 },
            ["falsifier"] = "The asymmetry vanishes when the same predicate is checked on a disjoint later slice.",
            ["warrant"] = warrant,
            ["evidence"] = new Dictionary<string, object?>
            {
                ["n_exemplars"] = 40,
                ["n_creators"] = 12,
                ["n_cohorts"] = 3,
                ["n_trends"] = 4,
                ["prevalence_in_top_decile"] = 0.70,
                ["prevalence_in_contrast_set"] = 0.20,
                ["prevalence_ratio"] = 3.5,
                ["contrast_set_definition"] = "the same creators' posts below their own top decile",
                ["temporal_slices"] = new object[]
                {
                    new Dictionary<string, object?> { ["from"] = "2026-01-01", ["to"] = "2026-03-31", ["prevalence_ratio"] = 3.5 },
                    new Dictionary<string, object?> { ["from"] = "2026-04-01", ["to"] = "2026-06-30", ["prevalence_ratio"] = 2.1 },
                },
            },
            ["provenance"] = new Dictionary<string, object?>
            {
                ["corpus_selection"] = "Proxy",
                ["predicate_evaluation"] = "Measured",
                ["label"] = "Proxy-selected, Measured-evaluated",
            },
            ["never_tested_against"] = "content that was attempted and failed",
            ["ingestion_arm"] = ingestionArm,
            ["ratified_by"] = ratified ? "11111111-1111-1111-1111-111111111111" : null,
            ["ratified_at"] = ratified ? "2026-07-09T00:00:00Z" : null,
            ["ratification_note"] = ratified ? "Reviewed against 62 exemplars; the asymmetry holds." : null,
            ["valid_from"] = "2026-07-10",
            ["valid_to"] = "2026-12-31",
            ["occasioned_by_trend_ids"] = new[] { "22222222-2222-2222-2222-222222222222" },
        };

    public static string ManifestJson(
        string version,
        IReadOnlyList<Dictionary<string, object?>> mechanisms,
        DateTimeOffset? cutAt = null,
        string? exemplarIndexUri = null,
        string? supersedes = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["mechanism_library_version"] = version,
            ["vertical"] = "beauty",
            ["platform"] = "tiktok",
            ["cut_at"] = (cutAt ?? Now).ToString("O"),
            ["published_at"] = (cutAt ?? Now).ToString("O"),
            ["compatible_extractor_versions"] = new[] { "3.2.x" },
            ["corpus_snapshot_sha256"] = "corpus-" + version,
            ["mechanisms"] = mechanisms,
            ["sha256"] = "declared-" + version,
        };
        if (exemplarIndexUri is not null) body["exemplar_index_uri"] = exemplarIndexUri;
        if (supersedes is not null) body["supersedes"] = supersedes;
        return JsonSerializer.Serialize(body);
    }

    public static string ExemplarIndexJson(string mechanismId, params Dictionary<string, object?>[] records)
        => JsonSerializer.Serialize(new Dictionary<string, object?> { [mechanismId] = records });

    public static Dictionary<string, object?> Exemplar(
        string uri, bool predicateSatisfied = true, bool redistributable = true, bool deleted = false)
        => new()
        {
            ["public_post_uri"] = uri,
            ["observed_at"] = "2026-05-01",
            ["predicate_satisfied"] = predicateSatisfied,
            ["redistributable"] = redistributable,
            ["deleted"] = deleted,
        };

    /// <summary>A live C4 over a temp artefact store. Writes the manifest, repoints the cohort pointer.</summary>
    public sealed class Store : IDisposable
    {
        public string Root { get; } = Directory.CreateTempSubdirectory("ugc-c4-").FullName;
        public ArtefactWriter Writer => new(Root);
        public TestClock Clock { get; } = new(Now);

        public string PublishManifest(string json, string cohortKey = "beauty.tiktok")
        {
            var sha = Writer.Write(ArtefactStore.MechanismsPrefix, json);
            Writer.RepointActiveVersion(ArtefactStore.MechanismsPrefix, cohortKey, sha);
            return sha;
        }

        public string PublishArtefact(string json) => Writer.Write(ArtefactStore.MechanismsPrefix, json);

        public PrefixScopedMechanismReader Reader =>
            new(ArtefactStore.OpenPrefix(Root, ArtefactStore.MechanismsPrefix));

        // One instance, so its resolver's verified-artefact cache persists across calls within a test.
        private KnowledgeApiEndpoints? _api;
        public KnowledgeApiEndpoints Api => _api ??= new(Reader, Clock);

        public void MutateArtefact(string sha, string newContent)
        {
            var path = Path.Combine(Root, ArtefactStore.MechanismsPrefix, sha[..2], sha + ".json");
            File.WriteAllText(path, newContent);
        }

        public void Dispose() => Directory.Delete(Root, recursive: true);
    }
}
