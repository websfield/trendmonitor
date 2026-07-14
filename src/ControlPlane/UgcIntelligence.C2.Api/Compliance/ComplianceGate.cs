using UgcIntelligence.Domain.Entities;

namespace UgcIntelligence.C2.Api.Compliance;

/// <summary>
/// REQ-010, REQ-011. The compliance gate: the six vetoes computed deterministically, in application
/// code, from extracted features and stored records. <strong>The single most important property of
/// this component is what it does not read: the model's output.</strong>
///
/// <para>There is no overload of <see cref="Evaluate"/> that takes a model output. A model-raised
/// <c>suspected_veto</c> is surfaced elsewhere for human attention; it is never an input here, and no
/// configuration makes it one. This is asserted structurally by <c>ModelNotInDecisionPathTests</c>.</para>
///
/// <para>The gate runs <em>before</em> extraction completes. Rights, brand-safety, minor-creator and
/// claims-ledger checks read stored records only. When the <see cref="FeatureRecord"/> is null, V1 and V5
/// degrade to caption + metadata: V1 passes only on an adequate caption disclosure, and V5 passes only
/// when the brief specifies no technical requirement — otherwise each is <em>unevaluable</em>, held for
/// human review. The no-disclosure-required carve-out is <strong>not</strong> applied blind with features
/// null, because a product claim spoken on audio or shown on screen is then invisible (#4). An unevaluable
/// veto is never a veto that passed.</para>
/// </summary>
public static class ComplianceGate
{
    /// <summary>
    /// Compute all six vetoes for one submission at Gate A. Returns a <see cref="ComplianceResult"/>
    /// with one <see cref="VetoResult"/> per veto, each carrying <c>(fired, evaluable, evidence)</c>.
    /// </summary>
    public static ComplianceResult Evaluate(
        FeatureRecord? features,
        Submission submission,
        Brief brief,
        Creator creator,
        IReadOnlyList<RightsGrant> grants,
        ClaimsLedger? claimsLedger,
        IReadOnlyList<BrandSafetyRule> brandSafetyRules,
        PlatformDisclosureRules? disclosureRules = null)
    {
        var rules = disclosureRules ?? PlatformDisclosureRules.Default;

        return new ComplianceResult(
        [
            DisclosureDetector.Evaluate(features, submission, rules),   // V1
            EvaluateClaimIntegrity(features, submission, claimsLedger), // V2
            EvaluateBrandSafety(features, submission, creator, brandSafetyRules), // V3
            EvaluateRightsRecord(grants, submission.SubmittedAt),       // V4
            EvaluateTechnicalSpec(features, brief),                     // V5
            EvaluateMinorCreator(creator),                              // V6
        ]);
    }

    /// <summary>
    /// V2. Product claims in caption + on-screen text + transcript, diffed against the campaign's
    /// approved claims ledger. An absent ledger makes V2 <em>unevaluable</em> — the submission cannot
    /// be approved, and the state is surfaced as unevaluable, not passed.
    /// </summary>
    private static VetoResult EvaluateClaimIntegrity(FeatureRecord? features, Submission submission, ClaimsLedger? ledger)
    {
        if (ledger is null)
            return VetoResult.Unevaluable("V2",
                "No approved claims ledger for this campaign: claim-to-ledger traceability cannot be established. "
                + "Held for human review — not passed.");

        var onScreen = features is null ? null : string.Join(' ', features.OnScreenText.Select(s => s.Text));
        var claims = ClaimDetector.DetectClaims(submission.Caption, onScreen, features?.Transcript);
        if (claims.Count == 0)
            return VetoResult.Pass("V2", "No product claims asserted; nothing to trace.");

        var untraceable = claims.Where(c => !ClaimDetector.IsTraceable(c, ledger.ApprovedClaims)).ToList();
        return untraceable.Count == 0
            ? VetoResult.Pass("V2", $"All claims trace to the ledger: {string.Join(", ", claims)}.")
            : VetoResult.Fire("V2", $"Claim(s) not in the approved ledger: {string.Join(", ", untraceable)}.");
    }

    /// <summary>
    /// V3. Configured rules plus the creator record's active flags. Absolute by design — no carve-out.
    /// Reads stored records and caption metadata, so it is evaluable even when extraction is down.
    /// </summary>
    private static VetoResult EvaluateBrandSafety(
        FeatureRecord? features, Submission submission, Creator creator, IReadOnlyList<BrandSafetyRule> rules)
    {
        if (creator.ActiveBrandSafetyFlags.Count > 0)
            return VetoResult.Fire("V3",
                $"Creator record carries active brand-safety flag(s): {string.Join(", ", creator.ActiveBrandSafetyFlags)}.");

        var onScreen = features is null ? null : string.Join(' ', features.OnScreenText.Select(s => s.Text));
        var haystack = string.Join(' ', new[] { submission.Caption, onScreen, features?.Transcript }
            .Where(s => !string.IsNullOrWhiteSpace(s))).ToLowerInvariant();

        var triggered = rules
            .Where(r => !string.IsNullOrWhiteSpace(r.Term) && haystack.Contains(r.Term.ToLowerInvariant(), StringComparison.Ordinal))
            .Select(r => r.Term)
            .ToList();

        return triggered.Count > 0
            ? VetoResult.Fire("V3", $"Configured brand-safety rule(s) triggered: {string.Join(", ", triggered)}.")
            : VetoResult.Pass("V3", "No active creator flag and no configured rule triggered.");
    }

    /// <summary>
    /// V4. A <see cref="RightsGrant"/> query — reads the table, never the caption. Gate A requires an
    /// unexpired <see cref="RightsGrantType.OrganicPublish"/> that carries evidence. Public posting,
    /// tagging, and branded-hashtag use are never a grant; a grant without evidence is not a grant.
    /// </summary>
    private static VetoResult EvaluateRightsRecord(IReadOnlyList<RightsGrant> grants, DateTimeOffset asOf)
    {
        var effective = grants.FirstOrDefault(g => g.IsEffective(RightsGrantType.OrganicPublish, asOf));
        if (effective is not null)
            return VetoResult.Pass("V4", "Unexpired organic_publish grant on record with evidence.");

        var withoutEvidence = grants.Any(g =>
            g.GrantType == RightsGrantType.OrganicPublish && string.IsNullOrWhiteSpace(g.EvidenceUri));
        var reason = withoutEvidence
            ? "An organic_publish grant exists but carries no evidence_uri. A grant without evidence is not a grant."
            : "No unexpired organic_publish grant with evidence on record. organic_publish is required at Gate A.";
        return VetoResult.Fire("V4", reason);
    }

    /// <summary>
    /// V5. <see cref="FeatureRecord"/> vs the brief's stored format requirements. Where the brief
    /// specifies no requirement, V5 does not run. When the brief has requirements but extraction is
    /// down, V5 is unevaluable — it cannot be computed from features, and the submission cannot be approved.
    /// </summary>
    private static VetoResult EvaluateTechnicalSpec(FeatureRecord? features, Brief brief)
    {
        var req = brief.Technical;
        if (req is null || !req.HasAnyRequirement)
            return VetoResult.Pass("V5", "Brief specifies no technical requirement; no check runs.");

        if (features is null)
            return VetoResult.Unevaluable("V5",
                "Extraction unavailable: technical spec cannot be computed from features. Held for human review.");

        var violations = new List<string>();
        if (req.MinDurationSeconds is { } minD && features.DurationSeconds is { } d && d < minD)
            violations.Add($"duration {d}s < required minimum {minD}s");
        if (req.MaxDurationSeconds is { } maxD && features.DurationSeconds is { } d2 && d2 > maxD)
            violations.Add($"duration {d2}s > required maximum {maxD}s");
        if (req.RequiredAspectRatio is { } ar && features.AspectRatio is { } fa
            && !string.Equals(ar, fa, StringComparison.OrdinalIgnoreCase))
            violations.Add($"aspect ratio {fa} != required {ar}");
        if (req.MinWidth is { } mw && features.Width is { } w && w < mw)
            violations.Add($"width {w} < required {mw}");
        if (req.MinHeight is { } mh && features.Height is { } h && h < mh)
            violations.Add($"height {h} < required {mh}");

        return violations.Count > 0
            ? VetoResult.Fire("V5", $"Technical spec not met: {string.Join("; ", violations)}.")
            : VetoResult.Pass("V5", "All stored technical requirements met.");
    }

    /// <summary>
    /// V6. The creator record's verified age, <strong>never inferred from the video</strong>. A known
    /// age under 18 fires V6 (→ EXCLUDED_FROM_AI_SCORING). A null age means the record does not
    /// establish age: the record is incomplete, so V6 is unevaluable and the submission fails closed
    /// to human review — it is not excluded, because we do not know the creator is a minor.
    /// </summary>
    private static VetoResult EvaluateMinorCreator(Creator creator)
    {
        if (creator.VerifiedAgeYears is not { } age)
            return VetoResult.Unevaluable("V6",
                "Creator record does not establish a verified age. Fail closed: held for human review, not AI-scored. "
                + "Age is never inferred from the video.");

        return age < 18
            ? VetoResult.Fire("V6", $"Creator's verified age is {age} (< 18). Excluded from AI scoring entirely.")
            : VetoResult.Pass("V6", $"Creator's verified age is {age} (>= 18).");
    }
}
