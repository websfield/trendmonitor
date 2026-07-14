namespace UgcIntelligence.C2.Api.Compliance;

/// <summary>
/// Platform-specific prominence expectations for V1. These are the thresholds that turn "present" into
/// "adequate": a disclosure buried past the caption fold, or shown too briefly and too small on
/// screen, is present and <em>inadequate</em>. Every tuning decision resolves toward recall
/// (eval plan: recall ≥ 0.98, precision ≥ 0.85), because a miss is a client-facing regulatory
/// exposure while a false positive costs a manager thirty seconds.
/// </summary>
public sealed record PlatformDisclosureRules(
    int CaptionFoldCharLimit,
    int MaxProminentHashtagOrdinal,
    int OnScreenEarlyMs,
    int OnScreenMinDurationMs,
    double OnScreenMinBoxHeight,
    int SpokenEarlyMs)
{
    /// <summary>
    /// Conservative cross-platform defaults. A disclosure is adequate in the caption only if it
    /// appears within the first ~125 characters (before the "more" fold) and, if it is a hashtag, is
    /// among the first three; on screen only if it appears within the first 3 seconds, is shown for at
    /// least 1 second, and is large enough to read; in audio only if spoken within the first 5 seconds.
    /// </summary>
    public static PlatformDisclosureRules Default => new(
        CaptionFoldCharLimit: 125,
        MaxProminentHashtagOrdinal: 3,
        OnScreenEarlyMs: 3000,
        OnScreenMinDurationMs: 1000,
        OnScreenMinBoxHeight: 0.03,
        SpokenEarlyMs: 5000);
}
