namespace UgcIntelligence.Artefacts.Writer;

/// <summary>
/// The write and promotion capability over the artefact store.
///
/// <para>This assembly is referenced by <strong>no C# component</strong>. C1 — the only writer of
/// either published artefact — is the Python intelligence plane, and it writes through the
/// language-neutral layout contract. C2 and C4 reference <c>UgcIntelligence.Artefacts</c> and get
/// <see cref="PrefixScopedReader"/>: one prefix, read-only, no repoint.</para>
///
/// <para>Repointing <c>active_version</c> <em>is</em> the promotion authority. C1 cannot publish a
/// pattern library without C3's <c>LibraryVerdict</c>; a mechanism library requires a named human's
/// ratification. Neither gate is enforceable if the repoint method is reachable from the components
/// those gates govern.</para>
/// </summary>
public sealed class ArtefactWriter(string rootPath)
{
    private readonly ArtefactStore _store = new(rootPath);

    public string Write(string prefix, string content) => _store.Write(prefix, content);

    /// <summary>Rollback and promotion are the same operation: repoint. An artefact is never edited.</summary>
    public void RepointActiveVersion(string prefix, string key, string sha256) =>
        _store.RepointActiveVersion(prefix, key, sha256);

    public string Read(string prefix, string sha256) => _store.Read(prefix, sha256);

    public string? ResolveActiveVersion(string prefix, string key) =>
        _store.ResolveActiveVersion(prefix, key);
}
