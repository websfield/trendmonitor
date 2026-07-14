namespace UgcIntelligence.Domain.Provenance;

/// <summary>
/// REQ-002. A value that cannot be laundered: it carries its provenance and its as-of date
/// wherever it travels. There is no unwrapping accessor that drops the label.
/// </summary>
public readonly record struct Provenanced<T>(
    T Value, Provenance Provenance, DateTimeOffset AsOf, Origin Origin = Origin.Real)
{
    public bool IsMeasurable => Provenance is Provenance.Measured or Provenance.UserProvided;
}

/// <summary>
/// The <em>only</em> type an effect-size calculation accepts (ADR-0001, REQ-008).
///
/// <para>
/// It is constructible solely from a <see cref="Provenance.Measured"/> or
/// <see cref="Provenance.UserProvided"/> value. There is no public constructor, no
/// implicit conversion, and no factory that accepts a <see cref="Provenance.Proxy"/> value.
/// </para>
///
/// <para>
/// This is what makes <em>"a Proxy value never enters an effect-size calculation, at any
/// weight, under any configuration"</em> a property of the type system rather than a rule
/// a reviewer has to notice. Pattern <em>proposal</em> may read the exemplar corpus;
/// pattern <em>estimation</em> may not.
/// </para>
/// </summary>
public readonly record struct MeasuredOutcome
{
    private readonly bool _initialised;

    /// <summary>
    /// A record struct always has an implicit parameterless constructor, so <c>default(MeasuredOutcome)</c>
    /// would otherwise be a fabricated <em>measured zero</em> — provenance <c>Measured</c> (enum 0),
    /// value <c>0</c> — that an estimator would happily ingest. That is imputation by accident, and
    /// imputation is exactly what this type exists to prevent. Reading it throws instead.
    /// </summary>
    private void EnsureInitialised()
    {
        if (!_initialised)
            throw new InvalidOperationException(
                "default(MeasuredOutcome) is not an observation. It is a zero wearing a Measured label. " +
                "Construct via MeasuredOutcome.TryFrom(...) and exclude what it declines — never impute it.");
    }

    private readonly decimal _value;
    private readonly Provenance _provenance;
    private readonly DateTimeOffset _asOf;
    private readonly Origin _origin;

    public decimal Value { get { EnsureInitialised(); return _value; } }
    public Provenance Provenance { get { EnsureInitialised(); return _provenance; } }
    public DateTimeOffset AsOf { get { EnsureInitialised(); return _asOf; } }

    /// <summary>A fixture-sourced outcome keeps its marker, so a client-facing surface can refuse it.</summary>
    public Origin Origin { get { EnsureInitialised(); return _origin; } }

    private MeasuredOutcome(decimal value, Provenance provenance, DateTimeOffset asOf, Origin origin)
        => (_value, _provenance, _asOf, _origin, _initialised) = (value, provenance, asOf, origin, true);

    /// <summary>
    /// Returns <c>null</c> for <see cref="Provenance.Proxy"/> and <see cref="Provenance.Estimated"/>.
    /// An estimator receiving <c>null</c> must exclude the observation, never impute it.
    /// </summary>
    public static MeasuredOutcome? TryFrom(Provenanced<decimal> value) =>
        value.IsMeasurable
            ? new MeasuredOutcome(value.Value, value.Provenance, value.AsOf, value.Origin)
            : null;
}
