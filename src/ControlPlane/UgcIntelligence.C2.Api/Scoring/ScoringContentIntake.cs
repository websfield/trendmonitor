namespace UgcIntelligence.C2.Api.Scoring;

/// <summary>
/// R4b-T7 (audit #21). The single load site where creator media text enters the scoring path. The audit
/// found that <see cref="Untrusted{T}"/> was airtight <em>once applied</em>, but marking was a
/// forgettable manual step at every future prompt-assembly call site. This closes that gap by moving the
/// mark to the boundary: the moment a caption, transcript, or on-screen string crosses the transport into
/// the process, it becomes <see cref="Untrusted{T}"/> here — before any code can hand it to a prompt.
///
/// <para>The raw <c>string</c> arguments are the <em>only</em> place a bare transport string is accepted;
/// after <see cref="FromTransport"/> the three fields are <see cref="Untrusted{T}"/>, so the sole road to
/// prompt text is <see cref="Fencing.Fence"/> (Rule 1: attacker-controlled media text never steers the
/// model). A scoring endpoint constructs this at its load site and thereafter cannot un-mark the content.</para>
/// </summary>
public sealed record ScoringContentIntake(
    Untrusted<string> Transcript,
    Untrusted<string> OnscreenText,
    Untrusted<string> Caption)
{
    /// <summary>
    /// Mark creator media text untrusted at the process boundary. Null fields become empty untrusted
    /// strings — absence is still untrusted, never a trusted default. This is the one sanctioned
    /// constructor path from raw transport strings.
    /// </summary>
    public static ScoringContentIntake FromTransport(string? transcript, string? onscreenText, string? caption) =>
        new(Untrusted<string>.Mark(transcript ?? string.Empty),
            Untrusted<string>.Mark(onscreenText ?? string.Empty),
            Untrusted<string>.Mark(caption ?? string.Empty));

    /// <summary>
    /// Compose the fenced prompt from this intake. The creator fields travel as <see cref="Untrusted{T}"/>
    /// straight into <see cref="FencedPrompt.Build"/>, which fences each one — there is no overload that
    /// accepts a raw string, so no un-fenced creator text can reach the model's context.
    /// </summary>
    public FencedPrompt BuildFencedPrompt(string instructions, IReadOnlyList<string> trustedContext) =>
        FencedPrompt.Build(instructions, trustedContext, Transcript, OnscreenText, Caption);
}
