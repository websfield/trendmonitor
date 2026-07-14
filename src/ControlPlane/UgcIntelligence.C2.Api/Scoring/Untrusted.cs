namespace UgcIntelligence.C2.Api.Scoring;

/// <summary>
/// Raised when <see cref="Untrusted{T}"/> content is coerced toward a prompt without
/// <see cref="Fencing.Fence"/>. A type error, because this <em>is</em> a type error: attacker-controlled
/// media text is not a <see cref="string"/> and must not be treated as one at a prompt boundary.
/// </summary>
public sealed class UnfencedUntrustedException(string message) : InvalidOperationException(message);

/// <summary>
/// The C# mirror of Phase 2's <c>Untrusted[T]</c> (ADR-0002). A value read from creator media — a
/// transcript, on-screen text, a caption — carries the fact that it came from outside the trust
/// boundary. Rule 1 says the model never decides; the corollary here is that untrusted content reaches
/// a model prompt <strong>only</strong> through an explicit, auditable <see cref="Fencing.Fence"/> call.
///
/// <para>This is a type barrier, not a convention. <see cref="ToString"/> throws, so an
/// interpolation (<c>$"{untrusted}"</c>) or a <c>string.Concat</c> that tried to smuggle the payload
/// into a prompt fails at the boundary — a reviewer does not have to notice the un-fenced
/// interpolation. Read the payload for <em>processing</em> (length, regex, storage) with
/// <see cref="ExposeForProcessing"/>, which is deliberately not named <c>Value</c> or <c>Text</c> so
/// that fencing stays the obvious path to prompt text.</para>
/// </summary>
public sealed class Untrusted<T>(T raw)
{
    private readonly T _raw = raw;

    /// <summary>Mark a raw value as untrusted. This is the only constructor path.</summary>
    public static Untrusted<T> Mark(T raw) => new(raw);

    /// <summary>Read the raw payload for a non-prompt use: length, deterministic regex, persistence, de-identification.</summary>
    public T ExposeForProcessing() => _raw;

    /// <summary>The road to a prompt that must stay closed. <c>$"{untrusted}"</c> lands here and throws.</summary>
    public override string ToString() =>
        throw new UnfencedUntrustedException(
            "Refusing to stringify Untrusted content. Untrusted media text (a transcript, a caption) reaches a "
            + "prompt only through Fencing.Fence(); ToString()/string interpolation bypass the audit boundary "
            + "that keeps attacker-controlled text from steering the model.");
}

/// <summary>The only sanctioned way to turn <see cref="Untrusted{T}"/> text into prompt text.</summary>
public static class Fencing
{
    /// <summary>
    /// Wrap the payload in explicit delimiters so a downstream prompt makes the trust boundary legible:
    /// everything inside is data, never instructions. There is no path to prompt text that skips this —
    /// you cannot fence a value that was never marked untrusted, and you cannot reach the prompt without
    /// marking it.
    /// </summary>
    public static string Fence(Untrusted<string> untrusted, string label)
    {
        ArgumentNullException.ThrowIfNull(untrusted);
        var raw = untrusted.ExposeForProcessing();
        return $"<{label}>\n{raw}\n</{label}>";
    }
}
