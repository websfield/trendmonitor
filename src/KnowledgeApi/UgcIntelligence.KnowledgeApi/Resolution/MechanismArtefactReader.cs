using UgcIntelligence.Artefacts;

namespace UgcIntelligence.KnowledgeApi.Resolution;

/// <summary>The artefact store was unreachable. C4 fails to a stale cache or a 503 — never a bare 500.</summary>
public sealed class MechanismStoreUnreachableException(string reason, Exception? inner = null)
    : Exception($"mechanism artefact store unreachable: {reason}", inner);

/// <summary>
/// C4's read grant, as an abstraction. It resolves and reads mechanism-library artefacts and <strong>only
/// those</strong> — the concrete implementation is bound to exactly one artefact-store prefix. There is no
/// method that writes, repoints, or names a second prefix.
/// </summary>
public interface IMechanismArtefactReader
{
    /// <summary>The active artefact sha256 for a <c>{vertical}.{platform}</c> key, or null when no library exists.</summary>
    string? ResolveActiveVersion(string key);

    /// <summary>Read and sha256-verify an artefact. Throws on mismatch (P1) or store-unreachable.</summary>
    string Read(string sha256);
}

/// <summary>
/// The production reader: a <see cref="PrefixScopedReader"/> <strong>bound to the mechanism prefix</strong>.
/// A18b — C4 cannot resolve a pattern library: the underlying reader is granted <c>mechanisms</c> only, so an
/// attempt to read the <c>patterns</c> prefix throws <see cref="PrefixGrantViolationException"/> (it fails,
/// it is not merely unattempted). "If C4 ever needs a second data source, the design is wrong" (ADR-0007 §1).
/// </summary>
public sealed class PrefixScopedMechanismReader(PrefixScopedReader reader) : IMechanismArtefactReader
{
    /// <summary>Exposes the granted prefix so a boundary test can assert it is the mechanism prefix and nothing else.</summary>
    public string GrantedPrefix => reader.GrantedPrefix;

    /// <summary>The underlying prefix-scoped reader, for boundary tests proving it cannot cross to the pattern prefix.</summary>
    public PrefixScopedReader Reader => reader;

    public string? ResolveActiveVersion(string key)
    {
        try
        {
            return reader.ResolveActiveVersion(ArtefactStore.MechanismsPrefix, key);
        }
        catch (IOException ex)
        {
            throw new MechanismStoreUnreachableException(ex.Message, ex);
        }
    }

    public string Read(string sha256)
    {
        try
        {
            return reader.Read(ArtefactStore.MechanismsPrefix, sha256);
        }
        catch (IOException ex)   // PrefixGrantViolationException is UnauthorizedAccessException, not IOException — it propagates
        {
            throw new MechanismStoreUnreachableException(ex.Message, ex);
        }
    }
}
