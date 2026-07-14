using System.Reflection;
using System.Text.Json;
using UgcIntelligence.Artefacts;
using UgcIntelligence.Artefacts.Writer;
using UgcIntelligence.Events;
using UgcIntelligence.Events.Writer;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

public sealed class ArtefactStoreTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("ugc-artefacts-").FullName;
    private ArtefactWriter Writer => new(_root);                                    // C1's capability
    private PrefixScopedReader C4 => ArtefactStore.OpenPrefix(_root, ArtefactStore.MechanismsPrefix);
    private PrefixScopedReader C2 => ArtefactStore.OpenPrefix(_root, ArtefactStore.PatternsPrefix);
    public void Dispose() => Directory.Delete(_root, recursive: true);

    [Fact]
    public void WriteThenRead_RoundTrips()
    {
        var sha = Writer.Write(ArtefactStore.MechanismsPrefix, """{"mechanism_library_version":"beauty.tiktok.m3"}""");
        Assert.Contains("beauty.tiktok.m3", C4.Read(ArtefactStore.MechanismsPrefix, sha));
    }

    /// <summary>P1. A mutated immutable artefact means the store is not what the contract says it is.</summary>
    [Fact]
    public void HashMismatch_Refuses_AndDoesNotReturnTheArtefact()
    {
        var sha = Writer.Write(ArtefactStore.MechanismsPrefix, """{"warrant":"contrasted"}""");
        var path = Path.Combine(_root, ArtefactStore.MechanismsPrefix, sha[..2], sha + ".json");
        File.WriteAllText(path, """{"warrant":"contrasted","effect_size":2.45}""");   // mutate it

        var ex = Assert.Throws<ArtefactHashMismatchException>(() => C4.Read(ArtefactStore.MechanismsPrefix, sha));
        Assert.Contains("P1", ex.Message);
    }

    [Fact]
    public void RollbackIsRepointing_AndTheSupersededVersionStillResolves()
    {
        var m3 = Writer.Write(ArtefactStore.MechanismsPrefix, """{"v":"m3"}""");
        var m4 = Writer.Write(ArtefactStore.MechanismsPrefix, """{"v":"m4"}""");

        Writer.RepointActiveVersion(ArtefactStore.MechanismsPrefix, "beauty.tiktok", m4);
        Assert.Equal(m4, C4.ResolveActiveVersion(ArtefactStore.MechanismsPrefix, "beauty.tiktok"));

        Writer.RepointActiveVersion(ArtefactStore.MechanismsPrefix, "beauty.tiktok", m3);   // rollback
        Assert.Equal(m3, C4.ResolveActiveVersion(ArtefactStore.MechanismsPrefix, "beauty.tiktok"));

        // A mechanism falsified in m4 still resolves in m3: a client told something under m3 must be
        // able to reconstruct what they were told.
        Assert.Contains("m4", C4.Read(ArtefactStore.MechanismsPrefix, m4));
    }

    /// <summary>ADR-0007 §1, as a reachability fact: C4's grant is one prefix, read-only.</summary>
    [Fact]
    public void PrefixGrant_CannotCrossPrefix()
    {
        var patternSha = Writer.Write(ArtefactStore.PatternsPrefix, """{"library_version":"beauty.tiktok.v7"}""");

        Assert.Throws<PrefixGrantViolationException>(() => C4.Read(ArtefactStore.PatternsPrefix, patternSha));
        Assert.Throws<PrefixGrantViolationException>(() => C4.ResolveActiveVersion(ArtefactStore.PatternsPrefix, "beauty.tiktok"));
    }

    [Fact]
    public void PrefixGrant_AllowsItsOwnPrefix()
    {
        var sha = Writer.Write(ArtefactStore.MechanismsPrefix, """{"v":"m3"}""");
        Assert.Contains("m3", C4.Read(ArtefactStore.MechanismsPrefix, sha));
    }

    /// <summary>
    /// The reader C2 and C4 hold exposes no write and no repoint. "C4 writes nothing" is a property
    /// of the type they can reach, not a rule they are asked to obey.
    /// </summary>
    [Fact]
    public void PrefixScopedReader_ExposesNoWriteOrRepointCapability()
    {
        var surface = typeof(PrefixScopedReader)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => !m.IsSpecialName)          // exclude the GrantedPrefix property getter
            .Select(m => m.Name).Order().ToArray();

        Assert.Equal(["Read", "ResolveActiveVersion"], surface);
    }

    /// <summary>
    /// Repointing active_version is the promotion authority. It must not be public on an assembly
    /// C2 and C4 reference.
    /// </summary>
    [Theory]
    [InlineData("Write")]
    [InlineData("RepointActiveVersion")]
    [InlineData("Read")]
    [InlineData("ResolveActiveVersion")]
    public void ArtefactStore_MutatingAndCrossPrefixMethods_AreNotPublic(string method)
    {
        var m = typeof(ArtefactStore).GetMethod(method, BindingFlags.Public | BindingFlags.Instance);
        Assert.Null(m);
    }

    [Fact]
    public void ArtefactStore_HasNoPublicConstructor() =>
        Assert.Empty(typeof(ArtefactStore).GetConstructors(BindingFlags.Public | BindingFlags.Instance));

    /// <summary>The write capability is granted to exactly one production assembly, like the event writer.</summary>
    [Fact]
    public void ArtefactWrite_IsGrantedToExactlyOneProductionAssembly()
    {
        var grants = typeof(ArtefactStore).Assembly
            .GetCustomAttributes<System.Runtime.CompilerServices.InternalsVisibleToAttribute>()
            .Select(a => a.AssemblyName)
            .Where(n => !n.Contains("Tests", StringComparison.Ordinal))
            .ToArray();

        Assert.Equal(["UgcIntelligence.Artefacts.Writer"], grants);
    }
}

public sealed class ImmutabilityTests
{
    /// <summary>Immutability is not a policy. There is no method to call.</summary>
    [Theory]
    [InlineData(typeof(ArtefactStore))]
    [InlineData(typeof(AppendOnlyEventLog))]
    [InlineData(typeof(ArtefactWriter))]
    [InlineData(typeof(PrefixScopedReader))]
    public void NoDeleteOrUpdateApiExists(Type t)
    {
        string[] forbidden = ["Delete", "Remove", "Update", "Mutate", "Overwrite", "Truncate", "Clear"];
        var offenders = t.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static)
                         .Where(m => !m.IsSpecialName)
                         .Select(m => m.Name)
                         .Where(n => forbidden.Any(f => n.StartsWith(f, StringComparison.Ordinal)))
                         .ToArray();

        Assert.True(offenders.Length == 0,
            $"{t.Name} exposes {string.Join(", ", offenders)}. A published artefact is never modified; " +
            "an event is never deleted. Rollback is repointing; correction is a compensating event.");
    }
}

public sealed class EventLogTests
{
    private static readonly Guid Tenant = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private static OutcomeEvent Event(string key, Guid? tenant = null) => new(
        EventId: Guid.NewGuid(),
        EventType: OutcomeEventType.PerformanceSnapshot,
        IdempotencyKey: key,
        TenantId: tenant ?? Tenant,
        OccurredAt: DateTimeOffset.UnixEpoch,
        RecordedAt: DateTimeOffset.UnixEpoch,
        Payload: new Dictionary<string, object?> { ["engagement_rate"] = 0.051m });

    /// <summary>
    /// At-least-once delivery is the contract. "This is the failure that silently corrupts the
    /// Pattern Library and it is the reason the key exists."
    /// </summary>
    [Fact]
    public async Task Append_DuplicateIdempotencyKey_IsNoOp_ReturningTheOriginalId()
    {
        var log = new AppendOnlyEventLog();
        var writer = new OutcomeEventWriter(log);

        var firstId = await writer.AppendAsync(Event("dup-key"));
        var secondId = await writer.AppendAsync(Event("dup-key"));   // different event id, same key

        Assert.Equal(firstId, secondId);
        Assert.Equal(1, log.Count);
    }

    [Fact]
    public async Task Append_DistinctKeys_BothLand()
    {
        var log = new AppendOnlyEventLog();
        var writer = new OutcomeEventWriter(log);

        await writer.AppendAsync(Event("k1"));
        await writer.AppendAsync(Event("k2"));

        Assert.Equal(2, log.Count);
    }

    [Fact]
    public void IdempotencyKey_IsDeterministic_ForTheSameLogicalEvent()
    {
        var entity = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var at = DateTimeOffset.Parse("2026-07-01T00:00:00Z");

        Assert.Equal(
            OutcomeEvent.ComputeIdempotencyKey(OutcomeEventType.PerformanceSnapshot, entity, at),
            OutcomeEvent.ComputeIdempotencyKey(OutcomeEventType.PerformanceSnapshot, entity, at));

        Assert.NotEqual(
            OutcomeEvent.ComputeIdempotencyKey(OutcomeEventType.PerformanceSnapshot, entity, at),
            OutcomeEvent.ComputeIdempotencyKey(OutcomeEventType.VerdictIssued, entity, at));
    }

    /// <summary>Media pointers do not outlive the rights window. Events reference feature_record_id only.</summary>
    [Fact]
    public async Task NoEvent_CarriesARawMediaUri()
    {
        var log = new AppendOnlyEventLog();
        await new OutcomeEventWriter(log).AppendAsync(Event("k"));

        await foreach (var e in log.ReplayAsync())
            foreach (var (k, v) in e.Payload)
            {
                Assert.DoesNotContain("media_uri", k, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("blob_uri", k, StringComparison.OrdinalIgnoreCase);
                if (v is string s)
                    Assert.False(s.StartsWith("http", StringComparison.OrdinalIgnoreCase),
                        "Events reference feature_record_id, never a raw media URI.");
            }
    }

    /// <summary>Replay is a first-class operation, not a recovery path.</summary>
    [Fact]
    public async Task Replay_ReconstructsEveryEvent_ScopedByTenant()
    {
        var log = new AppendOnlyEventLog();
        var writer = new OutcomeEventWriter(log);
        await writer.AppendAsync(Event("k1"));
        await writer.AppendAsync(Event("k2"));

        var mine = new List<OutcomeEvent>();
        await foreach (var e in log.ReplayAsync(Tenant)) mine.Add(e);
        Assert.Equal(2, mine.Count);

        var other = new List<OutcomeEvent>();
        await foreach (var e in log.ReplayAsync(Guid.NewGuid())) other.Add(e);
        Assert.Empty(other);   // tenant outcome data never crosses tenants
    }

    /// <summary>
    /// The NDJSON export C1 and C3 consume is tenant-scoped, exactly as ReplayAsync is. An unscoped
    /// export would be a cross-tenant read path wearing a different name.
    /// </summary>
    [Fact]
    public async Task ReplayExport_IsTenantScoped()
    {
        var other = Guid.Parse("33333333-3333-3333-3333-333333333333");
        var log = new AppendOnlyEventLog();
        var writer = new OutcomeEventWriter(log);
        await writer.AppendAsync(Event("k1"));
        await writer.AppendAsync(Event("k2", other));

        var mine = log.ToReplayExportNdjson(Tenant);
        Assert.Single(mine.Split('\n', StringSplitOptions.RemoveEmptyEntries));
        Assert.DoesNotContain(other.ToString(), mine);
    }

    /// <summary>The append capability is not public. C1 and C3 hold IOutcomeEventReader and nothing else.</summary>
    [Fact]
    public void Append_IsNotPublicOnTheLog() =>
        Assert.Null(typeof(AppendOnlyEventLog).GetMethod("Append", BindingFlags.Public | BindingFlags.Instance));

    /// <summary>
    /// R2 (#2). Contract B wire format: every serialized key — envelope and payload alike — is
    /// snake_case, and <c>event_type</c> is a <strong>string</strong>, never a numeric enum ordinal.
    /// This is the exact format the Python consumer (<c>c1_pattern_engine/corpora/internal.py</c>)
    /// parses; PascalCase keys or an integer <c>event_type</c> produce NDJSON it cannot read. One
    /// event of every <see cref="OutcomeEventType"/> is exported and inspected.
    /// </summary>
    [Fact]
    public async Task ReplayExport_KeysAreSnakeCase_AndEventTypeIsAString_ForEveryEventType()
    {
        var log = new AppendOnlyEventLog();
        var writer = new OutcomeEventWriter(log);
        foreach (var type in Enum.GetValues<OutcomeEventType>())
            await writer.AppendAsync(new OutcomeEvent(
                EventId: Guid.NewGuid(),
                EventType: type,
                IdempotencyKey: type.ToString(),
                TenantId: Tenant,
                OccurredAt: DateTimeOffset.UnixEpoch,
                RecordedAt: DateTimeOffset.UnixEpoch,
                Payload: new Dictionary<string, object?>
                {
                    ["submission_id"] = Guid.Empty,
                    ["live_post_id"] = Guid.Empty,
                    ["engagement_rate"] = 0.051m,
                }));

        var lines = log.ToReplayExportNdjson(Tenant).Split('\n', StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(Enum.GetValues<OutcomeEventType>().Length, lines.Length);

        var seenTypes = new List<string>();
        foreach (var line in lines)
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;

            var eventType = root.GetProperty("event_type");
            Assert.Equal(JsonValueKind.String, eventType.ValueKind);   // a string, never an integer
            seenTypes.Add(eventType.GetString()!);

            AssertAllKeysSnakeCase(root);                              // envelope and payload keys alike
        }

        // Every event type is present, and each serialized as its PascalCase enum name — the value
        // internal.py matches on (PostPublished, not post_published).
        Assert.Equal(Enum.GetNames<OutcomeEventType>().Order().ToArray(), seenTypes.Order().ToArray());
    }

    private static void AssertAllKeysSnakeCase(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var prop in element.EnumerateObject())
                {
                    Assert.True(prop.Name.All(c => !char.IsUpper(c)),
                        $"Contract B: key '{prop.Name}' is not snake_case. A PascalCase key produces " +
                        "NDJSON the intelligence plane cannot read.");
                    AssertAllKeysSnakeCase(prop.Value);
                }
                break;
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                    AssertAllKeysSnakeCase(item);
                break;
        }
    }
}
