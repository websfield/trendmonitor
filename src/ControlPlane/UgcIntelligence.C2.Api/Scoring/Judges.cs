namespace UgcIntelligence.C2.Api.Scoring;

/// <summary>
/// P3-T2. The default binding for <see cref="IJudge"/>. <strong>The deterministic offline fake is the
/// default</strong>: any composition root resolves <see cref="IJudge"/> to <see cref="OfflineJudge"/>
/// unless a live provider is explicitly enabled behind a configuration gate — and that gate is currently
/// blocked on the APP 8 cross-border-disclosure decision (compliance-notes: required before a creator's
/// content meets a model at scale). Phase 3 ships the abstraction, not the provider: there is no live LLM
/// call of any kind, and the default makes that the path of least resistance rather than a rule to remember.
/// </summary>
public static class Judges
{
    /// <summary>The default judge: offline, deterministic, no network, no secret.</summary>
    public static IJudge Default() => new OfflineJudge();

    /// <summary>
    /// A live provider would be constructed only here, and only when <paramref name="crossBorderApproved"/>
    /// records that the APP 8 decision has been made. Until then this throws: fail closed, so a live model
    /// cannot be reached by accident or by flipping a config value that was never gated on the legal review.
    /// </summary>
    public static IJudge Live(bool crossBorderApproved) =>
        crossBorderApproved
            ? throw new NotSupportedException(
                "No live judge provider ships in Phase 3. The abstraction is here; the provider is not, and "
                + "the cross-border (APP 8) decision that would authorise sending creator content to an "
                + "overseas model has its own review. Wire a provider in a later phase, behind this gate.")
            : throw new InvalidOperationException(
                "A live judge cannot be used until the APP 8 cross-border-disclosure decision is recorded. "
                + "Fail closed to the offline default (Judges.Default()).");
}
