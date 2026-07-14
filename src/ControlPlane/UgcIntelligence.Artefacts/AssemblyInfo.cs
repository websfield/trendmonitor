using System.Runtime.CompilerServices;

// The artefact store's Write and RepointActiveVersion are `internal`.
//
// Repointing `active_version` IS the promotion authority: C1 publishes a pattern library only on
// C3's LibraryVerdict, and a mechanism library only on human ratification. If that method were
// public on an assembly C2 and C4 reference, then C4 — the read-only, tenant-data-free component
// whose entire safety argument is "there is nothing here to leak" — would hold a write capability
// and could repoint a published library. "C4 writes nothing" would be a comment.
//
// So the capability lives behind this grant, exactly as IOutcomeEventWriter does. C2 and C4
// reference UgcIntelligence.Artefacts and receive only ArtefactStore.OpenPrefix(...) ->
// PrefixScopedReader: one prefix, read-only, no repoint.
//
// Adding another name to this list is a boundary violation (ADR-0007 §1). The architecture suite
// asserts this list has exactly one entry besides the test project.
[assembly: InternalsVisibleTo("UgcIntelligence.Artefacts.Writer")]
[assembly: InternalsVisibleTo("UgcIntelligence.Architecture.Tests")]
