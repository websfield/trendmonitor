using System.Security.Cryptography;
using System.Text;

namespace UgcIntelligence.Artefacts;

/// <summary>
/// Content-addressed, immutable artefact store. The layout is a language-neutral contract, because
/// C1 (Python) writes what C2 and C4 (C#) read:
/// <code>
///   &lt;prefix&gt;/&lt;sha256[0:2]&gt;/&lt;sha256&gt;.json      the immutable artefact
///   &lt;prefix&gt;/pointer/&lt;key&gt;.json                   holds active_version
/// </code>
///
/// <para><strong>Write and repoint are <c>internal</c>.</strong> They are granted to
/// <c>UgcIntelligence.Artefacts.Writer</c> alone, which C1's publisher path references and which
/// C2 and C4 do not. Making them public would put "C4 writes nothing" and the promotion authority
/// (repointing <c>active_version</c>) inside C4's process — reachable, and therefore not an invariant.
/// The event log is split the same way and for the same reason.</para>
///
/// <para><strong>There is no delete API.</strong> A published version is never modified. A pattern
/// retired in v8 still resolves in v7, because a score produced under v7 pins v7 and its evidence
/// must remain reconstructible. Rollback is repointing <c>active_version</c>, not editing an artefact.</para>
/// </summary>
public sealed class ArtefactStore
{
    public const string PatternsPrefix = "patterns";
    public const string MechanismsPrefix = "mechanisms";

    private readonly string _root;

    /// <summary>
    /// Internal. A reader obtains a store through <see cref="OpenPrefix"/>, which hands back a
    /// reader scoped to exactly one prefix and holding no write capability.
    /// </summary>
    internal ArtefactStore(string rootPath) => _root = rootPath;

    /// <summary>
    /// The only public door into the store, and it opens onto exactly one prefix, read-only.
    /// ADR-0007 §1: <em>"If C4 ever needs a second data source, the design is wrong."</em>
    /// </summary>
    public static PrefixScopedReader OpenPrefix(string rootPath, string grantedPrefix) =>
        new(new ArtefactStore(rootPath), grantedPrefix);

    public static string ComputeSha256(string content) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(content)));

    /// <summary>Write-once. Granted to the writer assembly only.</summary>
    internal string Write(string prefix, string content)
    {
        var sha = ComputeSha256(content);
        var path = PathFor(prefix, sha);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        if (!File.Exists(path)) File.WriteAllText(path, content);
        return sha;
    }

    /// <summary>
    /// Verifies the hash on every read. A mismatch means an immutable artefact was mutated:
    /// the store is not what the contract says it is. <strong>Refuse it. Alarm as a P1.</strong>
    /// Never return an unverified artefact.
    /// </summary>
    internal string Read(string prefix, string sha256)
    {
        var path = PathFor(prefix, sha256);
        if (!File.Exists(path)) throw new ArtefactNotFoundException(prefix, sha256);

        var content = File.ReadAllText(path);
        var actual = ComputeSha256(content);
        if (!string.Equals(actual, sha256, StringComparison.OrdinalIgnoreCase))
            throw new ArtefactHashMismatchException(prefix, sha256, actual);

        return content;
    }

    /// <summary>
    /// Promotion. Rollback is repointing, never editing. Granted to the writer assembly only:
    /// C1 cannot publish a *pattern* library without C3's LibraryVerdict, and neither C2 nor C4
    /// may repoint anything at all.
    /// </summary>
    internal void RepointActiveVersion(string prefix, string key, string sha256)
    {
        var path = PointerFor(prefix, key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, sha256);
    }

    internal string? ResolveActiveVersion(string prefix, string key)
    {
        var path = PointerFor(prefix, key);
        return File.Exists(path) ? File.ReadAllText(path).Trim() : null;
    }

    private string PathFor(string prefix, string sha) =>
        Path.Combine(_root, prefix, sha[..2], sha + ".json");

    private string PointerFor(string prefix, string key) =>
        Path.Combine(_root, prefix, "pointer", key + ".json");
}

/// <summary>
/// A read-only capability bound to exactly one artefact-store prefix. This is the whole of C4's
/// read grant. It exposes no write, no repoint, and no way to name a different prefix — the
/// underlying store's methods are <c>internal</c>, so there is nothing to reach around it to.
/// </summary>
public sealed class PrefixScopedReader
{
    private readonly ArtefactStore _store;

    internal PrefixScopedReader(ArtefactStore store, string grantedPrefix)
        => (_store, GrantedPrefix) = (store, grantedPrefix);

    public string GrantedPrefix { get; }

    public string Read(string prefix, string sha256)
    {
        Guard(prefix);
        return _store.Read(prefix, sha256);
    }

    public string? ResolveActiveVersion(string prefix, string key)
    {
        Guard(prefix);
        return _store.ResolveActiveVersion(prefix, key);
    }

    private void Guard(string prefix)
    {
        if (!string.Equals(prefix, GrantedPrefix, StringComparison.Ordinal))
            throw new PrefixGrantViolationException(GrantedPrefix, prefix);
    }
}

public sealed class ArtefactNotFoundException(string prefix, string sha)
    : InvalidOperationException($"No artefact {sha} under prefix '{prefix}'.");

/// <summary>P1. A mutated immutable artefact means the store is not what the contract says it is.</summary>
public sealed class ArtefactHashMismatchException(string prefix, string expected, string actual)
    : InvalidOperationException(
        $"P1: artefact under '{prefix}' expected sha256 {expected} but content hashes to {actual}. " +
        "An immutable artefact was mutated. Refusing it and serving the previous verified version.");

public sealed class PrefixGrantViolationException(string granted, string attempted)
    : UnauthorizedAccessException(
        $"This reader's grant is the '{granted}' prefix; it attempted to read '{attempted}'. " +
        "A component that needs a second artefact-store prefix has a design error, not a permissions error (ADR-0007).");
