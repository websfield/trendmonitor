using UgcIntelligence.C2.Api.Compliance;
using UgcIntelligence.Domain.Entities;

namespace UgcIntelligence.C2.Api.GateB;

/// <summary>
/// REQ-034. The result of re-checking disclosure on the <em>published</em> post. <strong>It cannot be
/// fabricated from untrusted text.</strong> There is no public constructor, so a caption asserting its own
/// disclosure ("#ad appears at 0:02") cannot construct a <c>Verified = true</c> value — the only producer
/// is <see cref="LiveDisclosureChecker.Check"/>, which runs the deterministic disclosure detector over the
/// published artefact's extracted features. A creator (or a model) may raise a suspected veto; neither may
/// clear one, and neither may assert its own compliance.
/// </summary>
public sealed record LiveDisclosureResult
{
    public bool Verified { get; }
    public string Evidence { get; }

    // Internal: reachable only from LiveDisclosureChecker, in this assembly. No public constructor exists,
    // so no caller — trusted or not — can hand-build a "verified" disclosure fact.
    internal LiveDisclosureResult(bool verified, string evidence) => (Verified, Evidence) = (verified, evidence);
}

/// <summary>
/// P5-T4 / REQ-034. The live-post disclosure re-check. The compliant artefact and the published artefact
/// are different objects: a submission approved with an on-screen disclosure can be published without it.
/// This runs the same deterministic <see cref="DisclosureDetector"/> the Gate A V1 veto uses — reading
/// real on-screen tokens, their timing and bounding box, caption position, and spoken audio — over the
/// <strong>published</strong> features. It never reads a caption as an instruction; a claim of disclosure
/// that is not a real, prominent token does not verify.
///
/// <para>This is the input seam for the live-post fetcher, which is not wired this phase. When it lands, it
/// supplies the published <see cref="FeatureRecord"/>; the detector, not the fetcher, decides.</para>
/// </summary>
public static class LiveDisclosureChecker
{
    public static LiveDisclosureResult Check(
        FeatureRecord? publishedFeatures,
        Submission publishedPost,
        PlatformDisclosureRules? rules = null)
    {
        var veto = DisclosureDetector.Evaluate(publishedFeatures, publishedPost, rules ?? PlatformDisclosureRules.Default);

        // Verified present ⇔ V1 did not fire AND was evaluable: a real, prominent disclosure on the
        // published artefact. An unevaluable check (extraction unavailable) is not "verified".
        var verified = !veto.Fired && veto.Evaluable;
        return new LiveDisclosureResult(verified, veto.Evidence);
    }
}
