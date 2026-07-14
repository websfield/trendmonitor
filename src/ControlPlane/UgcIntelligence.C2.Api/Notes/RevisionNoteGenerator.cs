using System.Text.RegularExpressions;
using UgcIntelligence.C2.Api.Scoring;
using UgcIntelligence.Domain.Provenance;

namespace UgcIntelligence.C2.Api.Notes;

/// <summary>
/// REQ-016. One highest-leverage revision note. A note that says "strengthen the hook" fails acceptance;
/// every note must be <strong>specific</strong> (name the change, not the goal), <strong>time-coded</strong>
/// (reference the timestamp where it applies), <strong>exemplified</strong> (example copy, a described
/// visual, or a named edit), and <strong>bounded</strong> (implementable in under two hours).
///
/// <para><see cref="EstimatedVpsIfApplied"/> is labelled <see cref="Provenance.Estimated"/> — every score
/// this system produces is Estimated, and saying so is what keeps the recommendation honest.</para>
/// </summary>
public sealed record RevisionNote(
    string Criterion,
    string TimeCode,
    string Change,
    string Example,
    bool BoundedUnderTwoHours,
    Provenanced<decimal> EstimatedVpsIfApplied);

/// <summary>
/// The acceptance predicate for a revision note, shared with the eval-harness so a generic note fails in
/// exactly one place. The generator's output satisfies it; a bare goal like "strengthen the hook" does not.
/// </summary>
public static class RevisionNoteAcceptance
{
    private static readonly Regex TimeCodePattern = new(@"\b\d+:\d{2}\b", RegexOptions.Compiled);

    /// <summary>Bare goals that name an outcome, not a change. These fail acceptance.</summary>
    private static readonly string[] GenericGoals =
    [
        "strengthen the hook", "add a hook", "improve the hook", "make it better", "more impact",
        "the opening needs more impact", "needs more energy", "punch it up", "tighten it up",
    ];

    public static bool IsAcceptable(RevisionNote note, out IReadOnlyList<string> failures)
    {
        ArgumentNullException.ThrowIfNull(note);
        var f = new List<string>();
        var change = (note.Change ?? string.Empty).Trim();

        if (!TimeCodePattern.IsMatch(note.TimeCode ?? string.Empty))
            f.Add("not time-coded: no timestamp of the form m:ss");
        if (string.IsNullOrWhiteSpace(note.Example))
            f.Add("not exemplified: no example copy, described visual, or named edit");
        if (!note.BoundedUnderTwoHours)
            f.Add("not bounded: must be implementable in under two hours");
        if (change.Length < 15)
            f.Add("not specific: the change is too short to name a concrete edit");
        if (GenericGoals.Any(g => change.Equals(g, StringComparison.OrdinalIgnoreCase)))
            f.Add("not specific: names a goal, not a change");
        if (string.Equals(change, note.Example?.Trim(), StringComparison.OrdinalIgnoreCase))
            f.Add("the example merely restates the change");

        failures = f;
        return f.Count == 0;
    }
}

/// <summary>
/// P3-T6. Generates the single highest-leverage note, targeting the lowest-scoring weighted VPS criterion
/// (shareability, weight 0, is diagnostic and never the target). Deterministic: no live model call. The
/// per-criterion edit is concrete and time-coded, and the note carries the estimated VPS if applied.
/// </summary>
public static class RevisionNoteGenerator
{
    private sealed record Template(string TimeCode, string Change, string Example);

    private static readonly IReadOnlyDictionary<string, Template> Templates = new Dictionary<string, Template>
    {
        [Composition.HookStrength] = new("0:00-0:02",
            "Cut straight to the close-up you currently reach at 0:06 and lead with your strongest line.",
            "Overlay 'my dermatologist told me to stop' in 4 words across the upper third at 0:00."),
        [Composition.ScrollStopPower] = new("0:00-0:01",
            "Replace the opening wide shot with a frame that is visually distinct for this vertical.",
            "Hard-cut to the product in use against a high-contrast background instead of the room shot."),
        [Composition.CompletionLikelihood] = new("0:10-0:20",
            "Pay off the hook's promise before the midpoint instead of holding it to the end.",
            "Move the result reveal currently at 0:28 up to 0:12 so the curiosity gap closes early."),
        [Composition.Pacing] = new("0:04-0:12",
            "Trim the static stretch where the viewer has already understood the point.",
            "Compress 0:04-0:09 into a single 1.5-second beat and drop the repeated B-roll."),
        [Composition.EmotionalSpecificity] = new("0:05-0:09",
            "Name the particular feeling tied to a concrete situation the audience recognises as theirs.",
            "Say 'the 4pm slump before school pickup' instead of the generic 'feeling tired'."),
        [Composition.TextReadability] = new("0:00-0:30",
            "Shorten on-screen text to 3-5 words per line and keep it inside the platform safe zone.",
            "Split 'this changed my whole routine overnight' into two stacked lines of high contrast."),
        [Composition.AuthenticityRegister] = new("0:00-0:30",
            "Trade the studio look for a believable phone-camera take with visible friction.",
            "Keep the ambient room audio and one unscripted hesitation instead of the clean voice-over."),
    };

    /// <summary>The target score the note aims the weakest criterion at, used for the estimated VPS.</summary>
    private const decimal ImprovementTarget = 78m;

    /// <summary>
    /// Generate a note for the lowest-scoring weighted criterion. <paramref name="asOf"/> stamps the
    /// estimated-VPS provenance. Returns null only if no weighted criterion is present to target.
    /// </summary>
    public static RevisionNote? Generate(IReadOnlyDictionary<string, CriterionScore> criteria, DateTimeOffset asOf)
    {
        ArgumentNullException.ThrowIfNull(criteria);

        var targetable = criteria
            .Where(kv => Templates.ContainsKey(kv.Key) && Composition.VpsWeights.GetValueOrDefault(kv.Key) > 0m)
            .OrderBy(kv => kv.Value.Score)
            .ThenBy(kv => kv.Key, StringComparer.Ordinal)
            .ToList();
        if (targetable.Count == 0) return null;

        var worst = targetable[0].Key;
        var template = Templates[worst];

        // Estimated VPS if the note is applied: raise the weakest criterion to the improvement target.
        var improved = criteria.ToDictionary(kv => kv.Key, kv => kv.Value.Score);
        improved[worst] = Math.Max(improved[worst], ImprovementTarget);
        var estimatedVps = Composition.ComposeVpsFromScores(improved);

        return new RevisionNote(
            Criterion: worst,
            TimeCode: template.TimeCode,
            Change: template.Change,
            Example: template.Example,
            BoundedUnderTwoHours: true,
            EstimatedVpsIfApplied: new Provenanced<decimal>(estimatedVps, Provenance.Estimated, asOf));
    }
}
