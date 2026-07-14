using System.Runtime.CompilerServices;

// Contract B has exactly one writer, and it is C2.
//
// AppendOnlyEventLog.Append is `internal`. This is the ONLY assembly granted access to it, and
// UgcIntelligence.Events.Writer is referenced by UgcIntelligence.C2.Api alone. C1 and C3 hold
// IOutcomeEventReader and cannot reach a write path — not by convention, but because the symbol
// is not visible to them.
//
// Adding another name to this list is a boundary violation (ADR-0005). The architecture suite
// asserts this list has exactly one entry besides the test project.
[assembly: InternalsVisibleTo("UgcIntelligence.Events.Writer")]
[assembly: InternalsVisibleTo("UgcIntelligence.Architecture.Tests")]
