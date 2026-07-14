namespace UgcIntelligence.Domain.Entities;

/// <summary>A normalised bounding box in frame space; every component is in [0, 1].</summary>
public readonly record struct BoundingBox(double X, double Y, double Width, double Height)
{
    public double Area => Width * Height;
}

/// <summary>The surface a disclosure signal was detected on.</summary>
public enum DisclosureSurface
{
    OnScreenText,
    SpokenAudio,
}

/// <summary>
/// A disclosure detection extracted from the media. <strong>Presence is not the test; prominence is.</strong>
/// V1 reads the timing and the bounding box, because a <c>#ad</c> shown for 200ms in the corner is
/// present and inadequate. Caption disclosure is analysed separately from
/// <see cref="Submission.Caption"/>, which is available even when extraction is down.
/// </summary>
public sealed record DisclosureSignal(
    string Text,
    DisclosureSurface Surface,
    int StartMs,
    int EndMs,
    BoundingBox? Box);

/// <summary>A span of on-screen text with its timing and position. Feeds V2 (claim integrity).</summary>
public sealed record OnScreenTextSpan(
    string Text,
    int StartMs,
    int EndMs,
    BoundingBox? Box);

/// <summary>
/// Contract A view: the deterministic features the extraction service produces for a submission.
/// The compliance gate accepts this as <em>nullable</em> — extraction may not have completed, or may
/// have failed on corrupt media. When it is null, V1 and V5 cannot be computed from features; they
/// run on caption and metadata and <strong>the submission cannot be approved</strong>. A veto that
/// cannot be evaluated is not a veto that passed.
///
/// <para>No raw media URI travels with this record downstream; events reference
/// <c>feature_record_id</c> only.</para>
/// </summary>
public sealed record FeatureRecord(
    Guid Id,
    Guid SubmissionId,
    string ExtractorVersion,
    bool AudioPresent,
    int? DurationSeconds,
    string? AspectRatio,
    int? Width,
    int? Height,
    string? Transcript,
    IReadOnlyList<OnScreenTextSpan> OnScreenText,
    IReadOnlyList<DisclosureSignal> DisclosureSignals);
