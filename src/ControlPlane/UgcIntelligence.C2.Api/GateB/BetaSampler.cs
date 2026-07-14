namespace UgcIntelligence.C2.Api.GateB;

/// <summary>
/// A seeded Beta sampler for the explore arm's Thompson draw (Marsaglia–Tsang gamma method). It draws from
/// an injected <see cref="Random"/>, so the same seed and the same candidate order yield the same
/// allocation — the property that makes an allocation re-derivable from the event log.
///
/// <para>Because a Beta draw is floating-point and library-dependent, the seed alone guarantees
/// reproducibility only within one environment; <see cref="Version"/> travels on <c>AmplificationAllocated</c>
/// alongside the seed so a re-derivation knows which algorithm produced the number.</para>
/// </summary>
public sealed class BetaSampler(Random rng)
{
    /// <summary>The sampler library version, persisted on every allocation (events-v1.json 1.2.0).</summary>
    public const string Version = "beta-marsaglia-tsang-v1";

    /// <summary>Draw θ ~ Beta(α, β) via two Gamma draws. α, β &gt; 0.</summary>
    public double Sample(double alpha, double beta)
    {
        var x = Gamma(alpha);
        var y = Gamma(beta);
        var sum = x + y;
        return sum <= 0 ? 0.5 : x / sum;
    }

    private double Gamma(double k)
    {
        if (k < 1.0)
        {
            var u = rng.NextDouble();
            if (u <= 0) u = double.Epsilon;
            return Gamma(k + 1.0) * Math.Pow(u, 1.0 / k);
        }

        var d = k - 1.0 / 3.0;
        var c = 1.0 / Math.Sqrt(9.0 * d);
        while (true)
        {
            double x, v;
            do
            {
                x = Normal();
                v = 1.0 + c * x;
            }
            while (v <= 0);

            v = v * v * v;
            var u = rng.NextDouble();
            if (u < 1.0 - 0.0331 * x * x * x * x) return d * v;
            if (Math.Log(u <= 0 ? double.Epsilon : u) < 0.5 * x * x + d * (1.0 - v + Math.Log(v))) return d * v;
        }
    }

    private double Normal()
    {
        var u1 = rng.NextDouble();
        var u2 = rng.NextDouble();
        if (u1 <= 0) u1 = double.Epsilon;
        return Math.Sqrt(-2.0 * Math.Log(u1)) * Math.Cos(2.0 * Math.PI * u2);
    }
}
