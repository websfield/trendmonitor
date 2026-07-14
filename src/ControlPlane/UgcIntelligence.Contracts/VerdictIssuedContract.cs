namespace UgcIntelligence.Contracts;

/// <summary>
/// Contract B, the recordable values of <c>VerdictIssued.verdict</c> as defined by
/// <c>docs/initial/schemas/events-v1.json</c>. This C# mirror is generated-by-hand from the schema and
/// must not drift from it; <c>VerdictIssuedContractTests</c> asserts the two agree, member for member.
///
/// <para>Includes <see cref="EXCLUDED_FROM_AI_SCORING"/> as of contract 1.1.0: without it, a
/// V6-excluded minor would have to be misrecorded as one of the four REQ-015 verdicts. The routing
/// states <see cref="NEEDS_REVIEW"/> and <see cref="EXCLUDED_FROM_AI_SCORING"/> are recordable because
/// the alternative — forcing a false verdict — is worse.</para>
/// </summary>
public enum RecordableVerdict
{
    APPROVED,
    APPROVED_WITH_NOTES,
    REVISIONS_REQUIRED,
    REJECTED,
    NEEDS_REVIEW,
    EXCLUDED_FROM_AI_SCORING,
}

/// <summary>Pinned metadata for the OutcomeEvent contract (<c>events-v1.json</c>).</summary>
public static class OutcomeEventContract
{
    /// <summary>
    /// The published contract version. 1.1.0 added EXCLUDED_FROM_AI_SCORING; 1.2.0 made
    /// <c>rng_seed</c> + <c>sampler_version</c> required on AmplificationAllocated; 1.3.0 added the
    /// optional <c>human_approved_at</c> to VerdictOverridden (REQ-017/REQ-021, closes audit finding #1).
    /// </summary>
    public const string Version = "1.3.0";
}

/// <summary>
/// Contract B, the fields <c>AmplificationAllocated</c> must carry, mirrored from
/// <c>docs/initial/schemas/events-v1.json</c>. <c>AmplificationAllocatedContractTests</c> asserts this list
/// equals the schema's <c>required</c> array, so the two cannot drift.
///
/// <para>As of contract 1.2.0, <see cref="RngSeed"/> and <see cref="SamplerVersion"/> are required: a
/// Thompson/Beta draw is floating-point and library-dependent, so an allocation is re-derivable from the
/// event log — and its REQ-039 counterfactual reconstructable — only if both travel with it. An optional
/// seed is a seed that will be omitted.</para>
/// </summary>
public static class AmplificationAllocatedContract
{
    public const string LivePostId = "live_post_id";
    public const string Arm = "arm";
    public const string Spend = "spend";
    public const string Aws = "aws";
    public const string Rationale = "rationale";
    public const string Epsilon = "epsilon";
    public const string RngSeed = "rng_seed";
    public const string SamplerVersion = "sampler_version";

    /// <summary>The required fields, in schema order. The two 1.2.0 additions are the last two.</summary>
    public static readonly IReadOnlyList<string> RequiredFields =
        [LivePostId, Arm, Spend, Aws, Rationale, Epsilon, RngSeed, SamplerVersion];
}
