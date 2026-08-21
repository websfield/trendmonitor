# M2 entry design note — the `creator_profiles` tenancy cage

**Status:** design, pre-implementation. **This note is an M2 entry gate**, not a suggestion.
**Raised by:** audit 2026-08-17 finding #23 (`architecture-critic` finding 3 + `respin-tenancy-reviewer` NOTE, cross-critic).
**Receiving decision:** R-25 / the remediation plan's R0 (`docs/plans/respin-audit-remediation-2026-08-17.md`).
**Binds:** R-9 ("nothing crosses profiles or workspaces"), REQ-A03/D04, the Respin brain-tenancy Critical Path.

---

## The gap, stated exactly

M1's tenancy cage is **workspace-grained only**. `VerifiedWorkspaceId` is a branded string minted in exactly two sanctioned places — `withWorkspace` (session-side, verify-membership-then-scope) and `trustWorkspaceId` (the Stripe webhook's stored customer→workspace mapping, import-restricted by eslint allowlist to the webhook resolution files). `packages/credits`' public API accepts only that brand, so app code structurally cannot hand it an arbitrary id. `respin/tests/import-boundary.test.ts` enumerates the three mechanisms that keep the raw connection unreachable from `app/**`, and the cross-workspace suite enumerates `WorkspaceScope.accessors` programmatically so an accessor added without a breach validator fails a completeness assertion.

That machinery is good and it stops exactly one class of breach: workspace A reading workspace B.

M2 introduces `creator_profiles`, **nested under workspaces**. R-9 says nothing crosses *profiles* either. But a `VerifiedWorkspaceId` says nothing about which profile a caller may touch, so on the M1 cage as it stands:

```ts
// Both profiles belong to workspaces the caller is a member of.
// Nothing in the type system or the accessor map distinguishes them.
const brain = await getBrainDoc(db, scope.workspaceId, req.profileId); // ← profileId is a bare string
```

A `profileId` arriving from a URL, a form field, or a JSON body is an **unverified string**. If it is used to scope a query without being checked against the caller's workspace, a member of workspace A reads workspace B's brain the moment they guess or obtain a profile id — and brains are the single most sensitive object in the product (a creator's voice, their audience, their performance history). `with-workspace.ts`'s own header comment already anticipates this ("Signature is verify-membership-then-scope, not derivation-only, so M2 multi-profile / M6 seats don't re-plumb every consumer"), which is why the fix is an extension of the existing pattern rather than a new one.

## The rule

**No M2 code may accept a profile id as a bare `string`.** Every profile-scoped accessor takes a `VerifiedProfileId`, and that brand is mintable only by a helper that has proven, in the same call, that the profile belongs to the caller's already-verified workspace.

## Design

### 1. The brand

In `packages/db/src/with-workspace.ts`, beside `VerifiedWorkspaceId` — same file, deliberately, so the two brands and their mints are read together:

```ts
declare const verifiedProfileIdBrand: unique symbol;
/**
 * A creator-profile id that has been proven to belong to an already-verified
 * workspace. Minted ONLY by WorkspaceScope.profile() — there is no
 * `trustProfileId` counterpart, because no webhook or external system resolves
 * a profile the way Stripe's customer mapping resolves a workspace.
 */
export type VerifiedProfileId = string & {
  readonly [verifiedProfileIdBrand]: true;
};
```

**No `trustProfileId`.** The workspace brand needs an unverified mint because Stripe webhooks arrive with no session; nothing analogous exists for profiles. Adding an escape hatch "for symmetry" would create the exact hole this note closes. If M4+ ever needs one (a background job acting on a profile), it arrives with its own decision entry and its own eslint allowlist — never by default.

### 2. The mint — composite scoping, one query

`WorkspaceScope` gains a `profile` method. It is `async` because verification is a database fact, not a type-level one:

```ts
export type ProfileScope = {
  workspaceId: VerifiedWorkspaceId;
  profileId: VerifiedProfileId;
  accessors: {
    profile: () => Promise<CreatorProfile[]>;
    brainDocs: () => Promise<BrainDoc[]>;
    // …every profile-grained read, each COMPOSITE-scoped (see rule 3)
  };
};

// on WorkspaceScope:
profile: (id: string) => Promise<ProfileScope>;  // throws ProfileAccessError
```

The implementation is one composite-predicate query — the profile must match **both** the requested id and the scope's already-verified workspace:

```ts
const [row] = await db
  .select()
  .from(creatorProfiles)
  .where(and(
    eq(creatorProfiles.id, id),
    eq(creatorProfiles.workspaceId, workspaceId),  // ← the cage
  ))
  .limit(1);
if (!row) throw new ProfileAccessError(
  "profile: not found in this workspace"  // ← see rule 4 on the message
);
```

### 3. Composite scoping at **every** profile accessor

The verification above is necessary and **not sufficient**. Every accessor inside `ProfileScope` must *also* carry the workspace predicate, not just the profile one:

```ts
// RIGHT — composite, defence in depth
brainDocs: () => db.select().from(brainDocs).where(and(
  eq(brainDocs.profileId, profileId),
  eq(brainDocs.workspaceId, workspaceId),
)),

// WRONG — trusts that profileId's verification transitively protects this table
brainDocs: () => db.select().from(brainDocs).where(eq(brainDocs.profileId, profileId)),
```

The wrong form is *correct today* and becomes wrong the moment a profile is ever moved, merged, soft-deleted, or re-parented between workspaces — at which point the breach is silent and retroactive. This repo's own lesson (2026-07-30, "fix the class, not the field") is that a guard which depends on an invariant holding *elsewhere* is the guard that fails. Every profile-grained table therefore carries `workspace_id` as a real column with a real foreign key, and every accessor filters on both.

### 4. The refusal must not be an oracle

`ProfileAccessError` says **"not found in this workspace"** for both "no such profile anywhere" and "that profile belongs to someone else." Distinguishing them turns the error into a profile-id enumeration oracle. Same discipline as `withWorkspace`'s existing membership refusal.

## The entry gate — tests that cannot pass a foreign profile

These are **required before any M2 schema or route is written**, and each one must be shown to fail against the un-caged code:

| # | Test | Asserts |
|---|---|---|
| P1 | `scope.profile(<id from another workspace>)` throws `ProfileAccessError` | The mint refuses a foreign profile |
| P2 | The refusal message is byte-identical for "foreign profile" and "nonexistent profile" | No enumeration oracle (rule 4) |
| P3 | Programmatic enumeration of `ProfileScope.accessors` — every entry has a breach validator, mirroring the existing `WorkspaceScope.accessors` completeness assertion (AC-7) | An accessor added without a test fails the suite |
| P4 | For **each** accessor: seeded rows exist in workspace B under a profile with a colliding shape; the accessor returns only workspace A's | Composite scoping (rule 3), per accessor, not once |
| P5 | Type-level: passing a bare `string` where `VerifiedProfileId` is required fails `tsc` | The brand is load-bearing, not decorative |
| P6 | No `trustProfileId`-shaped export exists (grep assertion in the import-boundary suite) | The escape hatch stays absent by construction |

P4 is the one that catches the failure mode P1 cannot: P1 proves the *door* is locked, P4 proves each *window* is.

## Stop condition

Per the remediation plan: **M2 implementation does not start until this design is recorded** (it now is) **and P1–P6 exist as failing tests against the un-caged code.** A profile cage retro-fitted after the brain routes exist is the same work plus a migration plus an audit of every route written in between.
