using System.Text.Json;
using System.Text.Json.Serialization;

namespace UgcIntelligence.Events;

/// <summary>
/// The single Contract-B wire-format options for the Events assembly. Factored here so the one
/// serializer (<see cref="AppendOnlyEventLog.ToReplayExportNdjson"/>) shares — not copies — the
/// convention <c>Mechanism</c> and <c>ExemplarIndex</c> already use for Contracts A/E:
/// <see cref="JsonNamingPolicy.SnakeCaseLower"/> keys plus a snake_case
/// <see cref="JsonStringEnumConverter"/>, so enums serialize as strings, never integers.
///
/// <para>Per <c>integration-contract.md</c> Contract B: every serialized event — envelope and
/// payload alike — uses <c>snake_case</c> keys and string enum values. <c>event_type</c> is the one
/// value that stays PascalCase (e.g. <c>"PostPublished"</c>): it names the event type in the shared
/// enum <c>c1_pattern_engine/corpora/internal.py</c> parses, so its members carry
/// <see cref="JsonStringEnumMemberName"/> overrides that opt out of the naming policy. A C# serializer
/// that emitted PascalCase keys or a numeric <c>event_type</c> produces NDJSON the intelligence plane
/// cannot read.</para>
/// </summary>
internal static class EventSerialization
{
    internal static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
    };
}
