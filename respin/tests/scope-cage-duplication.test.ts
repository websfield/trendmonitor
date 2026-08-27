// AC-19 — the cage survives module re-evaluation.
//
// ITS OWN FILE, deliberately. This suite calls `vi.resetModules()`, which
// replaces the module registry for the rest of the file: every class object
// re-imported afterwards is a DIFFERENT class object, so an `instanceof` or a
// `rejects.toBeInstanceOf` in a sibling test would fail for a reason that has
// nothing to do with what it is testing. That is not hypothetical — it
// happened to the AC-13 escalation case when both lived in one file, and the
// failure looked exactly like the cage being broken. Vitest isolates test
// FILES, so the blast radius stops here.
//
// What is being proven: a scope minted BEFORE the module graph is re-evaluated
// is still accepted afterwards. Without the `globalThis`-keyed WeakSets, a
// second copy of `with-workspace.ts` gets its own empty registry and refuses
// every scope the first copy minted — under `vi.resetModules()`, and under a
// Next server bundled twice, with no diagnosable symptom.
import { describe, expect, it, vi } from "vitest";
import { createTestDb, ensureUserWorkspace, seedAuthUser, creatorProfiles } from "@respin/db";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
} from "../packages/db/src/with-workspace";

describe("AC-19: the globalThis-keyed cage survives module re-evaluation", () => {
  it("a scope minted before resetModules still passes the RE-IMPORTED assertions", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "dup_user");
    const workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "dup_user", name: "Dup" })
    ).workspace.id;
    const [profile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "P" })
      .returning();
    const wsScope = await withWorkspace(db, { authUserId: "dup_user" });
    const scope = await ProfileScope.mint(db, wsScope, profile.id);

    // The premise: it passes against the ORIGINAL module copy.
    expect(() => writeCapabilities(scope)).not.toThrow();

    vi.resetModules();
    const reimported = await import("../packages/db/src/with-workspace");
    // A genuinely different module instance — otherwise this proves nothing.
    expect(reimported.ProfileScope).not.toBe(ProfileScope);

    expect(() => reimported.assertScoped(scope)).not.toThrow();
    // AND the write surface, which is the check that actually regressed: an
    // `instanceof ProfileScope` here compares against the RE-IMPORTED class
    // object and refuses a real scope. Set membership does not.
    expect(() => reimported.writeCapabilities(scope)).not.toThrow();

    // NON-VACUITY: the re-imported copy still refuses a forgery, so the pass
    // above is the cage working rather than the cage being absent.
    const forged = Object.assign({}, scope) as unknown as ProfileScope;
    expect(() => reimported.writeCapabilities(forged)).toThrow();
  });
});
