using System.Text.Json;
using System.Text.Json.Serialization;

namespace UgcIntelligence.Domain;

/// <summary>
/// ADR-0003. The exploration budget ε.
///
/// <para>
/// Bounded to <c>[0.10, 0.30]</c>, defaulting to <c>0.18</c>. <strong>There is no route to zero.</strong>
/// Not a constructor, not a config binding, not JSON deserialization, not <c>default(ExplorationRate)</c>.
/// </para>
///
/// <para>
/// <em>"A configuration option that can be set to zero will be set to zero"</em> — by a client under
/// quarterly pressure. The floor exists so the argument is about how much, not whether, and it belongs
/// in the commercial agreement rather than in the product.
/// </para>
///
/// <para>
/// Without exploration, the estimated value of the unchosen arms never updates, so they are never
/// chosen. The Pattern Library converges on one narrow region of content space and its effect sizes
/// become artefacts of its own allocation policy.
/// </para>
/// </summary>
[JsonConverter(typeof(ExplorationRateJsonConverter))]
public readonly record struct ExplorationRate
{
    public const decimal Floor = 0.10m;
    public const decimal Ceiling = 0.30m;
    public const decimal DefaultValue = 0.18m;

    private readonly decimal _value;
    private readonly bool _initialised;

    private ExplorationRate(decimal value) => (_value, _initialised) = (value, true);

    /// <summary>
    /// Reading this on a <c>default(ExplorationRate)</c> throws rather than yielding <c>0</c>.
    /// A struct's zero value is the one route a validating constructor cannot close, so it is closed here.
    /// </summary>
    public decimal Value => _initialised
        ? _value
        : throw new InvalidOperationException(
            "default(ExplorationRate) is not a valid exploration rate. ε has no zero (ADR-0003). " +
            "Construct it with ExplorationRate.From(...) or use ExplorationRate.Default.");

    public static ExplorationRate Default => new(DefaultValue);

    public static ExplorationRate From(decimal value)
    {
        if (value < Floor || value > Ceiling)
            throw new ExplorationRateOutOfBoundsException(value);
        return new ExplorationRate(value);
    }

    public decimal ExploitShare => 1m - Value;
    public override string ToString() => _initialised ? _value.ToString("0.00") : "<uninitialised>";
}

public sealed class ExplorationRateOutOfBoundsException(decimal attempted)
    : ArgumentOutOfRangeException(nameof(attempted), attempted,
        $"ε must lie in [{ExplorationRate.Floor:0.00}, {ExplorationRate.Ceiling:0.00}]. " +
        (attempted <= 0m
            ? "It can never be zero or negative: a system that stops exploring stops being able to justify " +
              "its own recommendations within two quarters (ADR-0003)."
            : "The ceiling bounds how much client money funds content the model ranks low."));

/// <summary>Closes the deserialization route. A payload carrying <c>0</c> fails to bind rather than binding to zero.</summary>
public sealed class ExplorationRateJsonConverter : JsonConverter<ExplorationRate>
{
    public override ExplorationRate Read(ref Utf8JsonReader reader, Type _, JsonSerializerOptions __) =>
        ExplorationRate.From(reader.GetDecimal());

    public override void Write(Utf8JsonWriter writer, ExplorationRate value, JsonSerializerOptions _) =>
        writer.WriteNumberValue(value.Value);
}
