using System.Text;
using System.Text.RegularExpressions;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// P4-T10 (Rule 5). <strong>Calibration splits are temporal, never random.</strong> "Two posts from the
/// same campaign share a brief, a product, and an audience — a random split leaks." So no calibration
/// module — the C# C3 surface or the Python <c>c1_pattern_engine/calibration/**</c> — may contain a random
/// split: no <c>train_test_split</c>, no <c>sklearn.model_selection</c>, no <c>random_state</c>, no
/// <c>np.random</c>, no <c>shuffle(</c>, no <c>.sample(</c>.
///
/// <para>The scan reads the modules <em>as text</em> and, crucially, strips comments and docstrings first,
/// so a module that <em>documents its own absence of a shuffle</em> — as <c>holdout.py</c> deliberately
/// does — is not falsely flagged, while a real <c>from sklearn.model_selection import train_test_split</c>
/// in code is. The stripper is proven both ways by <c>Scanner_FlagsCode_ButNotDocstrings</c> (sensitivity
/// and specificity), and the scan is proven non-vacuous by <c>TheCalibrationModules_AreActuallyScanned</c>.
/// Falsifiable per verification step 8: adding a <c>train_test_split</c> import to a calibration module
/// turns the main test red.</para>
/// </summary>
public sealed class TemporalHoldoutTests
{
    private sealed record Forbidden(string Name, Regex Pattern);

    /// <summary>The forbidden random-split tokens, applied only to the code portion of each file.</summary>
    private static readonly Forbidden[] ForbiddenTokens =
    [
        new("train_test_split", new Regex(@"\btrain_test_split\b", RegexOptions.Compiled)),
        new("sklearn.model_selection", new Regex(@"sklearn\.model_selection", RegexOptions.Compiled)),
        new("import sklearn", new Regex(@"\b(from|import)\s+sklearn\b", RegexOptions.Compiled)),
        new("random_state", new Regex(@"\brandom_state\b", RegexOptions.Compiled)),
        new("np.random", new Regex(@"\bnp\.random\b", RegexOptions.Compiled)),
        new("random.shuffle/shuffle(", new Regex(@"(\.shuffle\s*\(|\bshuffle\s*\()", RegexOptions.Compiled)),
        new(".sample(", new Regex(@"\.sample\s*\(", RegexOptions.Compiled)),
    ];

    // ---- (1) the main assertion: no random split anywhere in a calibration module ------------------

    [Fact]
    public void NoCalibrationModule_ContainsARandomSplit()
    {
        var violations = new List<string>();

        foreach (var file in CalibrationFiles())
            foreach (var (line, code) in CodeLines(file))
                foreach (var forbidden in ForbiddenTokens)
                    if (forbidden.Pattern.IsMatch(code))
                        violations.Add($"{file}:{line}: [{forbidden.Name}] {code.Trim()}");

        Assert.True(violations.Count == 0,
            "Rule 5 VIOLATION: a calibration module contains a random split. Calibration uses temporal "
            + "holdouts only — a random split leaks, because two posts from one campaign share everything.\n"
            + string.Join("\n", violations));
    }

    // ---- (2) the scan is not vacuous: the real modules are actually read ---------------------------

    [Fact]
    public void TheCalibrationModules_AreActuallyScanned()
    {
        var files = CalibrationFiles().Select(f => f.Replace('\\', '/')).ToList();

        Assert.NotEmpty(files);
        Assert.Contains(files, f => f.EndsWith("/calibration/holdout.py", StringComparison.Ordinal));
        Assert.Contains(files, f => f.EndsWith("/calibration/spearman.py", StringComparison.Ordinal));
        Assert.Contains(files, f => f.Contains("/UgcIntelligence.C3.Calibration/", StringComparison.Ordinal)
                                    && f.EndsWith(".cs", StringComparison.Ordinal));
    }

    // ---- (3) self-check: the stripper catches code and spares documentation ------------------------

    [Fact]
    public void Scanner_FlagsCode_ButNotDocstrings()
    {
        // Sensitivity: a real import in code is caught.
        var codeHit = CodeLines("x.py", ["from sklearn.model_selection import train_test_split"]);
        Assert.Contains(codeHit, l => ForbiddenTokens.Any(f => f.Pattern.IsMatch(l.Code)));

        // Specificity: the same words inside a docstring — documentation of absence, exactly what
        // holdout.py does — are NOT flagged. Without this, the module explaining "no shuffle" self-fails.
        var docstring = CodeLines("x.py",
        [
            "\"\"\"This module has no shuffle, no train_test_split, and no sklearn.model_selection path.",
            "It uses np.random nowhere. The absence is the guarantee.\"\"\"",
            "def temporal_holdout(): ...",
        ]);
        Assert.DoesNotContain(docstring, l => ForbiddenTokens.Any(f => f.Pattern.IsMatch(l.Code)));

        // Specificity: a `#` comment mentioning the tokens is also not code.
        var comment = CodeLines("x.py", ["value = 1  # never call train_test_split here"]);
        Assert.DoesNotContain(comment, l => ForbiddenTokens.Any(f => f.Pattern.IsMatch(l.Code)));
    }

    // ---- file discovery ----------------------------------------------------------------------------

    private static string RepoRoot()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !File.Exists(Path.Combine(d.FullName, "CLAUDE.md"))) d = d.Parent;
        return d?.FullName ?? throw new InvalidOperationException("repo root not found");
    }

    private static IEnumerable<string> CalibrationFiles()
    {
        var root = RepoRoot();

        var pythonDir = Path.Combine(root, "src", "IntelligencePlane", "c1_pattern_engine", "calibration");
        if (Directory.Exists(pythonDir))
            foreach (var f in Directory.GetFiles(pythonDir, "*.py", SearchOption.AllDirectories))
                if (!f.Contains("__pycache__", StringComparison.Ordinal))
                    yield return f;

        var csharpDir = Path.Combine(root, "src", "ControlPlane", "UgcIntelligence.C3.Calibration");
        if (Directory.Exists(csharpDir))
            foreach (var f in Directory.GetFiles(csharpDir, "*.cs", SearchOption.AllDirectories))
                if (!f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                    && !f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
                    yield return f;
    }

    // ---- comment / docstring stripping -------------------------------------------------------------

    private static IEnumerable<(int Line, string Code)> CodeLines(string path) =>
        CodeLines(path, File.ReadAllLines(path));

    /// <summary>
    /// The code portion of each line, with comments and docstrings removed. Python (<c>#</c> and
    /// <c>"""</c>/<c>'''</c>) and C# (<c>//</c> and <c>/* */</c>) are handled by their own state machines;
    /// any other extension is treated as plain code (no stripping).
    /// </summary>
    private static List<(int Line, string Code)> CodeLines(string path, string[] lines) =>
        path.EndsWith(".py", StringComparison.OrdinalIgnoreCase) ? PythonCode(lines)
        : path.EndsWith(".cs", StringComparison.OrdinalIgnoreCase) ? CSharpCode(lines)
        : lines.Select((l, i) => (i + 1, l)).ToList();

    private static List<(int, string)> PythonCode(string[] lines)
    {
        var result = new List<(int, string)>();
        var inTriple = false;
        string? closer = null;

        for (var idx = 0; idx < lines.Length; idx++)
        {
            var raw = lines[idx];
            var sb = new StringBuilder();
            var p = 0;
            while (p < raw.Length)
            {
                if (inTriple)
                {
                    var close = raw.IndexOf(closer!, p, StringComparison.Ordinal);
                    if (close < 0) { p = raw.Length; }
                    else { p = close + 3; inTriple = false; closer = null; }
                    continue;
                }
                if (raw[p] == '#') break;                                  // comment to end of line
                if (p + 3 <= raw.Length && (raw.Substring(p, 3) == "\"\"\"" || raw.Substring(p, 3) == "'''"))
                {
                    closer = raw.Substring(p, 3);
                    inTriple = true;
                    p += 3;
                    continue;
                }
                sb.Append(raw[p]);
                p++;
            }
            result.Add((idx + 1, sb.ToString()));
        }
        return result;
    }

    private static List<(int, string)> CSharpCode(string[] lines)
    {
        var result = new List<(int, string)>();
        var inBlock = false;

        for (var idx = 0; idx < lines.Length; idx++)
        {
            var raw = lines[idx];
            var sb = new StringBuilder();
            var p = 0;
            while (p < raw.Length)
            {
                if (inBlock)
                {
                    var close = raw.IndexOf("*/", p, StringComparison.Ordinal);
                    if (close < 0) { p = raw.Length; }
                    else { p = close + 2; inBlock = false; }
                    continue;
                }
                if (p + 1 < raw.Length && raw[p] == '/' && raw[p + 1] == '/') break;      // // to end of line
                if (p + 1 < raw.Length && raw[p] == '/' && raw[p + 1] == '*') { inBlock = true; p += 2; continue; }
                sb.Append(raw[p]);
                p++;
            }
            result.Add((idx + 1, sb.ToString()));
        }
        return result;
    }
}
