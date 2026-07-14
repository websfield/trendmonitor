using UgcIntelligence.C2.Api.Scoring;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// P3-T2. The deterministic offline fake is the default judge, and no live provider ships in Phase 3.
/// </summary>
public sealed class JudgeDefaultTests
{
    [Fact]
    public void DefaultJudge_IsTheOfflineFake() =>
        Assert.IsType<OfflineJudge>(Judges.Default());

    /// <summary>The default judge produces a valid, deterministic result with no network and no secret.</summary>
    [Fact]
    public async Task DefaultJudge_ProducesAValidDeterministicResult()
    {
        var prompt = FencedPrompt.Build("Score.", [],
            Untrusted<string>.Mark(""), Untrusted<string>.Mark(""), Untrusted<string>.Mark(""));

        var result = await Judges.Default().ScoreAsync(prompt);

        Assert.True(JudgeResultValidator.TryValidate(result, out var validated, out var failure), failure);
        Assert.False(validated.Anomalous);
    }

    /// <summary>A live provider fails closed in Phase 3 whether or not the APP 8 flag is set — the provider does not exist.</summary>
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void LiveJudge_FailsClosed_InPhase3(bool crossBorderApproved) =>
        Assert.ThrowsAny<Exception>(() => Judges.Live(crossBorderApproved));
}
